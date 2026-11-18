import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"
import { crawlPageToHtml } from "@/services/crawl/html"

const ANALYSIS_LEASE_MS = 5 * 60_000
const STALE_ANALYSIS_AGE_MS = 60 * 60_000

// Request one page insight job and return only the context needed by the analysis worker.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || !("workerId" in body) || typeof body.workerId !== "string" || !body.workerId.trim()) {
    return workerApiError("invalid_worker_id", "workerId is required.")
  }
  const workerId = body.workerId.trim()
  const now = new Date()
  const staleBefore = new Date(now.getTime() - STALE_ANALYSIS_AGE_MS)
  const page = await prisma.page.findFirst({
    where: {
      type: "text/html",
      content: { not: null },
      domain: { is: { status: { notIn: ["discovered", "unlisted", "deleting"] } } },
      OR: [
        { status: "crawled", details: { path: ["crawlResultStatus"], equals: "Indexed" }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
        { status: "analyzing", OR: [{ analyzedOn: null }, { analyzedOn: { lte: staleBefore } }] },
      ],
    },
    orderBy: { discoveredOn: "asc" },
    select: {
      id: true,
      url: true,
      title: true,
      content: true,
      domainId: true,
      domain: { select: { name: true, categories: true, details: true, domain: true } },
    },
  })
  if (!page) return workerApiSuccess({ job: null })

  const claim = await prisma.page.updateMany({
    where: {
      id: page.id,
      domain: { is: { status: { notIn: ["discovered", "unlisted", "deleting"] } } },
      OR: [
        { status: "crawled", details: { path: ["crawlResultStatus"], equals: "Indexed" }, OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }] },
        { status: "analyzing", OR: [{ analyzedOn: null }, { analyzedOn: { lte: staleBefore } }] },
      ],
    },
    data: {
      status: "analyzing",
      analyzedOn: now,
      crawlLeaseUntil: new Date(now.getTime() + ANALYSIS_LEASE_MS),
    },
  })
  if (claim.count !== 1) return workerApiSuccess({ job: null })

  await prisma.domain.updateMany({ where: { id: page.domainId, status: { in: ["crawling", "crawled", "analyzing", "analyzed", "indexed"] } }, data: { status: "analyzing" } })

  await prisma.crawlerWorker.upsert({
    where: { id: workerId },
    create: { id: workerId, status: "Working", activity: `Generating insight for ${page.url}`, siteId: page.domainId, siteUrl: null, currentUrl: page.url, lastSeenAt: new Date() },
    update: { status: "Working", activity: `Generating insight for ${page.url}`, siteId: page.domainId, siteUrl: null, currentUrl: page.url, lastSeenAt: new Date() },
  })

  const domainDetails = page.domain.details && typeof page.domain.details === "object" && !Array.isArray(page.domain.details)
    ? page.domain.details as Record<string, unknown>
    : {}
  let siteProfile: Record<string, unknown> | null = null
  if (!domainDetails.summary && !domainDetails.siteProfileGeneratedAt) {
    const homepageCandidates = await prisma.page.findMany({
      where: { domainId: page.domainId, type: "text/html", content: { not: null }, status: { in: ["crawled", "analyzing", "analyzed", "indexed"] } },
      select: { url: true, title: true, content: true },
      orderBy: { discoveredOn: "asc" },
      take: 20,
    })
    const homepage = homepageCandidates.find((candidate) => {
      try {
        const url = new URL(candidate.url)
        return url.pathname === "/" && url.hostname.toLowerCase() === page.domain.domain.toLowerCase()
      } catch {
        return false
      }
    })
    if (homepage?.content) {
      const renderedContent = (await crawlPageToHtml(homepage.url)).html
      siteProfile = {
        siteId: page.domainId,
        siteUrl: homepage.url,
        homepageName: homepage.title || page.domain.name,
        homepageContent: homepage.content,
        renderedContent,
      }
    }
  }

  return workerApiSuccess({
    job: "analysis",
    page: {
      id: page.id,
      siteId: page.domainId,
      url: page.url,
      title: page.title || "",
      content: page.content || "",
      siteCategory: page.domain.categories,
      claimedOn: now.toISOString(),
    },
    siteProfile,
  })
}
