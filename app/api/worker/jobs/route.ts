import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"
import { prepareCrawler } from "@/services/neupbot"

const WORK_LEASE_MS = 5 * 60_000
const LEASE_HEARTBEAT_MS = 10_000
const STALE_PAGE_AGE_MS = 60 * 60_000

// Keep the active worker visible while the API server processes a long crawl.
async function refreshWorkerHeartbeat(workerId: string): Promise<void> {
  await prisma.crawlerWorker.updateMany({ where: { id: workerId }, data: { lastSeenAt: new Date() } })
}

// Validate the worker ID supplied with a job request.
async function readWorkerId(request: NextRequest): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || !("workerId" in body) || typeof body.workerId !== "string") return null
  return body.workerId.trim() || null
}

// Atomically claim a domain that needs its discovery queue prepared.
async function claimDomain(workerId: string) {
  const now = new Date()
  const domain = await prisma.domain.findFirst({
    where: { status: { in: ["requested", "toCrawl"] }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
    orderBy: { addedOn: "asc" },
    select: { id: true, domain: true },
  })
  if (!domain) return null

  const updated = await prisma.domain.updateMany({
    where: { id: domain.id, status: { in: ["requested", "toCrawl"] }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
    data: { status: "crawling", crawlWorkerId: workerId, crawlLeaseUntil: new Date(now.getTime() + WORK_LEASE_MS) },
  })
  return updated.count === 1 ? domain : null
}

// Atomically claim one pending page from a site that is ready to crawl.
async function claimPage() {
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_PAGE_AGE_MS)
  const page = await prisma.page.findFirst({
    where: {
      OR: [
        { status: { in: ["toCrawl", "crawled", "analyzing", "analyzed", "indexed"] }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
        { status: "crawling", OR: [{ crawledOn: null }, { crawledOn: { lte: staleBefore } }] },
      ],
    },
    orderBy: [{ domainId: "asc" }, { discoveredOn: "asc" }],
    select: { id: true, domainId: true, url: true },
  })
  if (!page) return null

  const claimedOn = now
  const updated = await prisma.page.updateMany({
    where: {
      id: page.id,
      OR: [
        { status: { in: ["toCrawl", "crawled", "analyzing", "analyzed", "indexed"] }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
        { status: "crawling", OR: [{ crawledOn: null }, { crawledOn: { lte: staleBefore } }] },
      ],
    },
    data: { status: "crawling", crawledOn: claimedOn, crawlLeaseUntil: new Date(now.getTime() + WORK_LEASE_MS) },
  })
  return updated.count === 1 ? { ...page, claimedOn: claimedOn.toISOString() } : null
}

// Claim a domain setup task or a page for an independent crawler process.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const workerId = await readWorkerId(request)
  if (!workerId) return workerApiError("invalid_worker_id", "workerId is required.")

  try {
    const domain = await claimDomain(workerId)
    if (domain) {
      await prisma.crawlerWorker.upsert({
        where: { id: workerId },
        create: { id: workerId, status: "Working", activity: `Preparing ${domain.domain}.`, siteId: domain.id, siteUrl: `https://${domain.domain}`, currentUrl: null, lastSeenAt: new Date() },
        update: { status: "Working", activity: `Preparing ${domain.domain}.`, siteId: domain.id, siteUrl: `https://${domain.domain}`, currentUrl: null, lastSeenAt: new Date() },
      })
      const heartbeat = setInterval(() => {
        void Promise.all([
          prisma.domain.updateMany({ where: { id: domain.id, crawlWorkerId: workerId }, data: { crawlLeaseUntil: new Date(Date.now() + WORK_LEASE_MS) } }),
          refreshWorkerHeartbeat(workerId),
        ]).catch((error) => console.error(`[worker-api:${workerId}] Could not renew domain worker heartbeat.`, error))
      }, LEASE_HEARTBEAT_MS)
      try {
        await prepareCrawler(domain.id, `https://${domain.domain}`)
      } finally {
        clearInterval(heartbeat)
        await prisma.domain.updateMany({ where: { id: domain.id, crawlWorkerId: workerId }, data: { crawlWorkerId: null, crawlLeaseUntil: null } })
      }
      return workerApiSuccess({ job: "domain", id: domain.id, completed: true })
    }

    const page = await claimPage()
    if (!page) return workerApiSuccess({ job: null })

    await prisma.crawlerWorker.upsert({
      where: { id: workerId },
      create: { id: workerId, status: "Working", activity: "Starting", siteId: page.domainId, siteUrl: null, currentUrl: page.url, lastSeenAt: new Date() },
      update: { status: "Working", activity: "Starting", siteId: page.domainId, siteUrl: null, currentUrl: page.url, lastSeenAt: new Date() },
    })
    const pageWithDomain = await prisma.page.findUnique({
      where: { id: page.id },
      select: { id: true, domainId: true, url: true, domain: { select: { domain: true } } },
    })
    if (!pageWithDomain) return workerApiError("page_not_found", "Claimed page no longer exists.", 404)
    return workerApiSuccess({
      job: "page",
      page: { id: page.id, siteId: page.domainId, url: page.url, domain: pageWithDomain.domain.domain, claimedOn: page.claimedOn },
    })
  } catch (error) {
    console.error("[worker-api] Job processing failed.", error)
    return workerApiError("job_failed", error instanceof Error ? error.message : "Worker job failed.", 500)
  }
}
