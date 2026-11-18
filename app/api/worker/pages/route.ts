import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"

type SubmittedLink = { url: string; text?: string; rel?: string }

// Choose a new page's state from its target site's current crawl state.
async function getInitialPageStatus(domainId: string): Promise<"paused" | "toCrawl" | "discovered"> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { status: true } })
  if (domain?.status === "paused") return "paused"
  if (domain && ["requesting", "requested"].includes(domain.status)) return "toCrawl"
  return "discovered"
}

// Convert a posted link URL to a normalized absolute URL on the crawled site.
function normalizeInternalLink(value: string, pageUrl: string, hostname: string): string | null {
  try {
    const url = new URL(value, pageUrl)
    if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase() !== hostname.toLowerCase()) return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

// Save crawled page data and enqueue newly discovered internal pages.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return workerApiError("invalid_payload", "A JSON object is required.")
  const input = body as Record<string, unknown>
  if (typeof input.workerId !== "string" || !input.workerId.trim()) return workerApiError("invalid_worker_id", "workerId is required.")
  if (typeof input.pageId !== "string" || !input.pageId.trim()) return workerApiError("invalid_page_id", "pageId is required.")
  if (typeof input.claimedOn !== "string" || Number.isNaN(new Date(input.claimedOn).getTime())) return workerApiError("invalid_claim", "A valid claimedOn timestamp is required.")
  if (typeof input.finalUrl !== "string" || typeof input.content !== "string") return workerApiError("invalid_page_data", "finalUrl and content are required strings.")

  const page = await prisma.page.findUnique({
    where: { id: input.pageId },
    select: { id: true, domainId: true, url: true, details: true, domain: { select: { domain: true, details: true, status: true } } },
  })
  if (!page) return workerApiError("page_not_found", "Page not found.", 404)
  if (page.domain.domain.toLowerCase() !== new URL(page.url).hostname.toLowerCase()) return workerApiError("page_domain_mismatch", "The page does not belong to its claimed site.", 409)

  const statusCode = typeof input.statusCode === "number" ? input.statusCode : 0
  const isHtml = input.isHtml === true
  const nextStatus = "crawled" as const
  const crawlResultStatus = isHtml && statusCode >= 200 && statusCode < 400 ? "Indexed" : statusCode >= 400 ? "Error" : "Skipped"
  const crawledOn = new Date()
  const claimedOn = new Date(input.claimedOn)
  const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
    ? page.details as Record<string, unknown>
    : {}
  const savedPage = await prisma.page.updateMany({
    where: { id: page.id, status: "crawling", crawledOn: claimedOn },
    data: {
      title: typeof input.title === "string" ? input.title : null,
      description: typeof input.description === "string" ? input.description : null,
      content: input.content,
      status: nextStatus,
      statusCode,
      lastCrawled: crawledOn,
      crawledOn,
      details: {
        ...details,
        finalUrl: input.finalUrl,
        crawlResultStatus,
        currentActivity: crawlResultStatus === "Indexed" ? "Crawl saved; waiting for analysis." : "Page skipped after crawl.",
        crawlFlowUpdatedAt: new Date().toISOString(),
      },
    },
  })
  if (savedPage.count !== 1) return workerApiError("page_lease_lost", "The page claim is no longer current.", 409)

  const postedLinks = Array.isArray(input.links) ? input.links.slice(0, 500) as SubmittedLink[] : []
  const media: Array<Record<string, unknown>> = [
    ...(Array.isArray(input.images) ? input.images.slice(0, 500).map((entry) => ({ ...(entry as Record<string, unknown>), kind: "image" })) : []),
    ...(Array.isArray(input.videos) ? input.videos.slice(0, 200).map((entry) => ({ ...(entry as Record<string, unknown>), kind: "video" })) : []),
  ]
  await prisma.resource.deleteMany({ where: { sourcePageId: page.id } })
  const resources: Array<{ url: string; type: string; anchorText: string | null; rel: string | null }> = [
    ...postedLinks.flatMap((link) => link && typeof link.url === "string" ? [{ url: link.url, type: "link", anchorText: link.text || null, rel: link.rel || null }] : []),
    ...media.flatMap((item) => typeof item.url === "string" ? [{ url: item.url, type: String(item.kind), anchorText: typeof item.alt === "string" ? item.alt : null, rel: null }] : []),
  ]
  for (const item of resources) {
    let targetUrl: string
    try { targetUrl = new URL(item.url, input.finalUrl as string).toString() } catch { continue }
    const targetDomainUrl = new URL(targetUrl)
    if (targetDomainUrl.protocol !== "http:" && targetDomainUrl.protocol !== "https:") continue
    const targetDomainId = targetDomainUrl.hostname.toLowerCase() === page.domain.domain.toLowerCase()
      ? page.domainId
      : (await prisma.domain.upsert({
        where: { domain: targetDomainUrl.hostname.toLowerCase() },
        create: { id: crypto.randomUUID(), domain: targetDomainUrl.hostname.toLowerCase(), name: targetDomainUrl.hostname, status: "discovered" },
        update: {},
        select: { id: true },
      })).id
    let targetPage = item.type === "link" && targetDomainId !== page.domainId
      ? null
      : await prisma.page.findFirst({ where: { domainId: targetDomainId, url: targetUrl }, select: { id: true } })
    if ((targetDomainId === page.domainId && item.type === "link") || item.type !== "link") {
      targetPage ??= await prisma.page.create({
        data: {
          domainId: targetDomainId,
          url: targetUrl,
          type: item.type === "link" ? "text/html" : item.type,
          status: await getInitialPageStatus(targetDomainId),
          discoveredOn: new Date(),
          details: {},
        },
        select: { id: true },
      })
    }
    await prisma.resource.upsert({
      where: { linkFrom_linkTo_fromDomain_toDomain_type: { linkFrom: page.url, linkTo: targetUrl, fromDomain: page.domainId, toDomain: targetDomainId, type: item.type } },
      create: { type: item.type, linkFrom: page.url, linkTo: targetUrl, fromDomain: page.domainId, toDomain: targetDomainId, sourcePageId: page.id, targetPageId: targetPage?.id, sourceType: item.type, anchorText: item.anchorText, rel: item.rel },
      update: { type: item.type, sourcePageId: page.id, targetPageId: targetPage?.id, sourceType: item.type, anchorText: item.anchorText, rel: item.rel },
    })
  }
  const discoveredPages = resources.filter((resource) => resource.type === "link").length

  const currentDomainDetails = page.domain.details && typeof page.domain.details === "object" && !Array.isArray(page.domain.details)
    ? page.domain.details as Record<string, unknown>
    : {}
  await prisma.domain.update({
    where: { id: page.domainId },
    data: {
      lastCrawled: new Date(),
      details: {
        ...currentDomainDetails,
        currentActivity: "Page crawl complete.",
        currentCrawlUrl: "",
        internalResourcesFound: discoveredPages,
      },
    },
  })
  await prisma.page.updateMany({
    where: { id: page.id, status: "crawled", crawledOn },
    data: { crawlLeaseUntil: null },
  })

  return workerApiSuccess({ pageId: page.id, status: nextStatus, discoveredPages })
}
