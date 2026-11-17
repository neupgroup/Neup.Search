import { randomUUID } from "node:crypto"
import type { CrawlerWorkerStatus } from "@prisma/client"
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
const WORKER_HEARTBEAT_INTERVAL_MS = 10_000

type WorkerState = {
  status: CrawlerWorkerStatus
  activity: string
  siteId: string | null
  siteUrl: string | null
  currentUrl: string | null
}

let workerState: WorkerState = {
  status: "Starting",
  activity: "Starting worker.",
  siteId: null,
  siteUrl: null,
  currentUrl: null,
}
let workerHeartbeat: ReturnType<typeof setInterval> | undefined

// Persist the worker's current task so the live monitor can show idle and active processes.
async function updateWorkerState(nextState: Partial<WorkerState> = {}): Promise<void> {
  workerState = { ...workerState, ...nextState }
  const lastSeenAt = new Date()
  try {
    await prisma.crawlerWorker.upsert({
      where: { id: workerId },
      create: { id: workerId, ...workerState, lastSeenAt },
      update: { ...workerState, lastSeenAt },
    })
  } catch (error) {
    console.error(`[crawler-worker:${workerId}] Could not update worker status.`, error)
  }
}

// Append a completed or active stage to the current page job's visible progress trail.
async function appendWorkerStage(stage: string): Promise<void> {
  const stages = workerState.activity.split(" → ")
  if (stages.at(-1) === stage) return
  await updateWorkerState({ activity: [...stages, stage].join(" → ") })
}

// Allow the process manager to stop a worker cleanly; its lease expires if it was mid-crawl.
function stopWorker(): void {
  clearInterval(workerHeartbeat)
  void updateWorkerState({ status: "Stopped", activity: "Worker stopped.", siteId: null, siteUrl: null, currentUrl: null })
    .finally(() => prisma.$disconnect().finally(() => process.exit(0)))
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
  await updateWorkerState({ status: "Working", activity: `Preparing ${domain.domain}.`, siteId: domain.id, siteUrl: `https://${domain.domain}`, currentUrl: null })
  const heartbeat = startLeaseHeartbeat("domain", domain.id)
  try {
    await prepareCrawler(domain.id, `https://${domain.domain}`)
  } finally {
    clearInterval(heartbeat)
    await prisma.domain.updateMany({
      where: { id: domain.id, crawlWorkerId: workerId },
      data: { crawlWorkerId: null, crawlLeaseUntil: null },
    })
    await updateWorkerState({ status: "Idle", activity: "Waiting for work.", siteId: null, siteUrl: null, currentUrl: null })
  }
}

// Crawl one claimed page and release it so another worker can safely process the next page.
async function processPage(page: { id: string; domainId: string; url: string }): Promise<void> {
  const domain = await prisma.domain.findUnique({ where: { id: page.domainId }, select: { domain: true } })
  await updateWorkerState({ status: "Working", activity: "Starting", siteId: page.domainId, siteUrl: domain ? `https://${domain.domain}` : null, currentUrl: page.url })
  await sleep(300)
  const heartbeat = startLeaseHeartbeat("page", page.id)
  try {
    await runPageCrawler(page.id, {
      updateDomainProgress: false,
      leaseAlreadyClaimed: true,
      onActivity: appendWorkerStage,
    })
    if (workerState.activity.split(" → ").at(-1) === "Skipping") {
      await sleep(300)
      await appendWorkerStage("Exiting")
    }
  } catch (error) {
    console.error(`[crawler-worker:${workerId}] Page crawl failed for ${page.url}.`, error)
    const currentStage = workerState.activity.split(" → ").at(-1) || ""
    if (!currentStage.endsWith("(failed)") && currentStage !== "Skipping") {
      const failureStage = currentStage === "Generating Insights"
        ? "Generating Insights (failed)"
        : currentStage === "Saving Content"
          ? "Saving Content (failed)"
          : "Skipping"
      await appendWorkerStage(failureStage)
    }
    await sleep(300)
    await appendWorkerStage("Exiting")
    await prisma.page.updateMany({
      where: {
        id: page.id,
        crawlWorkerId: workerId,
        status: { in: ["Pending", "discovered-page", "crawling-page", "saved-content", "reported-errors", "analyzing-page"] },
      },
      data: {
        status: "Error",
        lastCrawled: new Date(),
        details: {
          ...(await prisma.page.findUnique({ where: { id: page.id }, select: { details: true } }))?.details as Record<string, unknown>,
          crawlError: error instanceof Error ? error.message : String(error),
        },
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
  await updateWorkerState({ status: "Idle", siteId: null, siteUrl: null, currentUrl: null })
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
  await updateWorkerState({ status: "Idle", activity: "Waiting for work." })
  workerHeartbeat = setInterval(() => void updateWorkerState(), WORKER_HEARTBEAT_INTERVAL_MS)
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
      await updateWorkerState({
        status: "Error",
        activity: error instanceof Error ? `Retrying after error: ${error.message}` : "Retrying after a queue error.",
        siteId: null,
        siteUrl: null,
        currentUrl: null,
      })
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

process.on("SIGINT", stopWorker)
process.on("SIGTERM", stopWorker)
void runWorker()
