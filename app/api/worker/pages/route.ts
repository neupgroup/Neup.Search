import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"

type SubmittedLink = { url: string; text?: string; rel?: string }

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
  if (typeof input.finalUrl !== "string" || typeof input.content !== "string" || typeof input.html !== "string") return workerApiError("invalid_page_data", "finalUrl, content, and html are required strings.")

  const page = await prisma.page.findUnique({
    where: { id: input.pageId },
    select: { id: true, domainId: true, url: true, data: true, details: true, domain: { select: { domain: true, details: true } } },
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
  const previousData = Array.isArray(page.data) ? page.data.filter((entry) => !entry || typeof entry !== "object" || !("kind" in entry) || entry.kind !== "crawl") : []
  const crawlData = {
    kind: "crawl",
    finalUrl: input.finalUrl,
    html: input.html,
    addedOn: new Date().toISOString(),
  }

  const savedPage = await prisma.page.updateMany({
    where: { id: page.id, status: "crawling", crawledOn: claimedOn },
    data: {
      title: typeof input.title === "string" ? input.title : null,
      description: typeof input.description === "string" ? input.description : null,
      content: input.content,
      data: [...previousData as Prisma.InputJsonValue[], crawlData as Prisma.InputJsonValue],
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

  const postedLinks = Array.isArray(input.links) ? input.links.slice(0, 300) as SubmittedLink[] : []
  const internalUrls = [...new Set(postedLinks.flatMap((link) => {
    if (!link || typeof link.url !== "string") return []
    const normalized = normalizeInternalLink(link.url, input.finalUrl as string, page.domain.domain)
    return normalized ? [normalized] : []
  }))]

  for (const url of internalUrls) {
    const targetPage = await prisma.page.findFirst({ where: { domainId: page.domainId, url }, select: { id: true } })
    const targetPageId = targetPage?.id ?? await prisma.page.create({
      data: { domainId: page.domainId, url, type: "text/html", status: "discovered", discoveredOn: new Date(), details: {} },
      select: { id: true },
    }).then((created) => created.id)
    const existingLink = await prisma.link.findFirst({ where: { sourcePageId: page.id, linkTo: url, sourceType: "anchor" }, select: { id: true } })
    if (existingLink) continue
    const submitted = postedLinks.find((link) => normalizeInternalLink(link.url, input.finalUrl as string, page.domain.domain) === url)
    await prisma.link.create({
      data: {
        linkFrom: page.url,
        linkTo: url,
        fromDomain: page.domainId,
        toDomain: page.domainId,
        sourcePageId: page.id,
        targetPageId,
        sourceType: "anchor",
        anchorText: submitted?.text || null,
        rel: submitted?.rel || null,
      },
    })
  }

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
        internalResourcesFound: internalUrls.length,
      },
    },
  })
  await prisma.page.updateMany({
    where: { id: page.id, status: "crawled", crawledOn },
    data: { crawlLeaseUntil: null },
  })

  return workerApiSuccess({ pageId: page.id, status: nextStatus, discoveredPages: internalUrls.length })
}
