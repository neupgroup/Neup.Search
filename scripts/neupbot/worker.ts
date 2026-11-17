import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  completeDomainCrawlIfIdle,
  prepareCrawler,
  runPageCrawler,
} from "@/services/neupbot"

const workerId = process.argv[2] || `neup-search-worker-${process.pid}-${randomUUID()}`
const POLL_INTERVAL_MS = 2_000
const LEASE_DURATION_MS = 5 * 60_000
const HEARTBEAT_INTERVAL_MS = 60_000

// Allow the process manager to stop a worker cleanly; its lease expires if it was mid-crawl.
function stopWorker(): void {
  void prisma.$disconnect().finally(() => process.exit(0))
}

// Wait between queue checks without keeping a separate timer alive.
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// Atomically claim a queued site while a worker prepares its initial URL and sitemap discoveries.
async function claimNextDomain() {
  const now = new Date()
  const candidate = await prisma.domain.findFirst({
    where: {
      status: "Requested",
      OR: [
        { crawlLeaseUntil: null },
        { crawlLeaseUntil: { lte: now } },
      ],
    },
    orderBy: { addedOn: "asc" },
    select: { id: true, domain: true },
  })

  if (!candidate) return null

  const claim = await prisma.domain.updateMany({
    where: {
      id: candidate.id,
      status: "Requested",
      OR: [
        { crawlLeaseUntil: null },
        { crawlLeaseUntil: { lte: now } },
      ],
    },
    data: {
      crawlWorkerId: workerId,
      crawlLeaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
    },
  })

  return claim.count === 1 ? candidate : null
}

// Claim one pending page from any site whose discovery phase is complete.
async function claimNextPage() {
  const now = new Date()
  const candidate = await prisma.page.findFirst({
    where: {
      status: "Pending",
      domain: { is: { status: "Crawling" } },
      OR: [
        { crawlLeaseUntil: null },
        { crawlLeaseUntil: { lte: now } },
      ],
    },
    orderBy: [{ domainId: "asc" }, { addedOn: "asc" }],
    select: { id: true, domainId: true, url: true },
  })

  if (!candidate) return null

  const claim = await prisma.page.updateMany({
    where: {
      id: candidate.id,
      status: "Pending",
      domain: { is: { status: "Crawling" } },
      OR: [
        { crawlLeaseUntil: null },
        { crawlLeaseUntil: { lte: now } },
      ],
    },
    data: {
      crawlWorkerId: workerId,
      crawlLeaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
    },
  })

  return claim.count === 1 ? candidate : null
}

// Renew a lease while its site discovery or page crawl is running.
function startLeaseHeartbeat(
  table: "domain" | "page",
  recordId: string,
): ReturnType<typeof setInterval> {
  const renewLease = table === "domain"
    ? () => prisma.domain.updateMany({
      where: { id: recordId, crawlWorkerId: workerId },
      data: { crawlLeaseUntil: new Date(Date.now() + LEASE_DURATION_MS) },
    })
    : () => prisma.page.updateMany({
      where: { id: recordId, crawlWorkerId: workerId },
      data: { crawlLeaseUntil: new Date(Date.now() + LEASE_DURATION_MS) },
    })

  return setInterval(() => {
    void renewLease().catch((error) => {
      console.error(`[crawler-worker:${workerId}] Could not renew ${table} lease for ${recordId}.`, error)
    })
  }, HEARTBEAT_INTERVAL_MS)
}

// Prepare a domain's seed and sitemap queue, then release its setup lease for page workers.
async function processDomain(domain: { id: string; domain: string }): Promise<void> {
  const heartbeat = startLeaseHeartbeat("domain", domain.id)
  try {
    await prepareCrawler(domain.id, `https://${domain.domain}`)
  } finally {
    clearInterval(heartbeat)
    await prisma.domain.updateMany({
      where: { id: domain.id, crawlWorkerId: workerId },
      data: { crawlWorkerId: null, crawlLeaseUntil: null },
    })
  }
}

// Crawl one claimed page and release it so another worker can safely process the next page.
async function processPage(page: { id: string; domainId: string; url: string }): Promise<void> {
  const heartbeat = startLeaseHeartbeat("page", page.id)
  try {
    await runPageCrawler(page.id, { updateDomainProgress: false, leaseAlreadyClaimed: true })
  } catch (error) {
    console.error(`[crawler-worker:${workerId}] Page crawl failed for ${page.url}.`, error)
    await prisma.page.updateMany({
      where: { id: page.id, crawlWorkerId: workerId, status: "Pending" },
      data: {
        status: "Error",
        lastCrawled: new Date(),
        details: { crawlError: error instanceof Error ? error.message : String(error) },
      },
    })
  } finally {
    clearInterval(heartbeat)
    await prisma.page.updateMany({
      where: { id: page.id, crawlWorkerId: workerId },
      data: { crawlWorkerId: null, crawlLeaseUntil: null },
    })
  }

  await completeDomainCrawlIfIdle(page.domainId)
}

// Finish sites whose last page completed just before a worker stopped or lost its connection.
async function finalizeIdleDomains(): Promise<void> {
  const domains = await prisma.domain.findMany({
    where: { status: "Crawling" },
    select: { id: true },
    take: 100,
    orderBy: { addedOn: "asc" },
  })

  await Promise.all(domains.map(({ id }) => completeDomainCrawlIfIdle(id)))
}

// Continuously prepare sites and claim individual pages, allowing workers to share one site's queue.
async function runWorker(): Promise<void> {
  console.info(`[crawler-worker:${workerId}] Worker is active.`)
  while (true) {
    try {
      const domain = await claimNextDomain()
      if (domain) {
        console.info(`[crawler-worker:${workerId}] Preparing ${domain.domain}.`)
        await processDomain(domain)
        continue
      }

      const page = await claimNextPage()
      if (page) {
        console.info(`[crawler-worker:${workerId}] Crawling ${page.url}.`)
        await processPage(page)
        continue
      }

      await finalizeIdleDomains()
    } catch (error) {
      console.error(`[crawler-worker:${workerId}] Queue processing failed.`, error)
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

process.on("SIGINT", stopWorker)
process.on("SIGTERM", stopWorker)
void runWorker()
