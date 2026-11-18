import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"

const workflowStatuses = ["discovered", "requested", "toCrawl", "crawling", "crawled", "analyzing", "analyzed", "indexed", "unlisted", "deleting"] as const

// Update a page or site crawl status through the authenticated worker API.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return workerApiError("invalid_payload", "A JSON object is required.")
  const input = body as Record<string, unknown>
  if (typeof input.status !== "string" || !input.status.trim()) return workerApiError("invalid_status", "status is required.")
  const activity = typeof input.activity === "string" ? input.activity : undefined

  if (typeof input.pageId === "string" && input.pageId.trim()) {
    if (!workflowStatuses.includes(input.status as typeof workflowStatuses[number])) return workerApiError("invalid_status", "status is not a supported page workflow status.")
    if (typeof input.claimedOn !== "string" || Number.isNaN(new Date(input.claimedOn).getTime())) return workerApiError("invalid_claim", "A valid claimedOn timestamp is required for page updates.")
    const claimedOn = new Date(input.claimedOn)
    const page = await prisma.page.findUnique({ where: { id: input.pageId }, select: { details: true, status: true, crawledOn: true, analyzedOn: true } })
    if (!page) return workerApiError("page_not_found", "Page not found.", 404)
    const claimTimestamp = input.status === "analyzing" || page.status === "analyzing" ? page.analyzedOn : page.crawledOn
    if (claimTimestamp?.getTime() !== claimedOn.getTime()) return workerApiError("page_lease_lost", "The page claim is no longer current.", 409)
    const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
      ? page.details as Record<string, unknown>
      : {}
    const updated = await prisma.page.updateMany({
      where: { id: input.pageId, AND: [{ status: page.status }, { status: { notIn: ["discovered", "unlisted", "deleting"] } }], ...(page.status === "analyzing" ? { analyzedOn: claimedOn } : { crawledOn: claimedOn }) },
      data: {
        status: input.status as typeof workflowStatuses[number],
        ...(input.status === "crawled" ? { crawledOn: new Date(), lastCrawled: new Date() } : {}),
        ...(input.status === "analyzed" ? { analyzedOn: new Date() } : {}),
        details: { ...details, ...(activity ? { currentActivity: activity } : {}), crawlFlowUpdatedAt: new Date().toISOString() },
        ...(input.status === "crawled" || input.status === "analyzed" ? { crawlLeaseUntil: null } : {}),
      },
    })
    if (updated.count !== 1) return workerApiError("page_lease_lost", "The page claim is no longer current.", 409)
    return workerApiSuccess({ pageId: input.pageId, status: input.status, updated: true })
  }

  if (typeof input.siteId === "string" && input.siteId.trim()) {
    if (!workflowStatuses.includes(input.status as typeof workflowStatuses[number])) return workerApiError("invalid_status", "status is not a supported site workflow status.")
    const domain = await prisma.domain.findUnique({ where: { id: input.siteId }, select: { details: true } })
    if (!domain) return workerApiError("site_not_found", "Site not found.", 404)
    const details = domain.details && typeof domain.details === "object" && !Array.isArray(domain.details)
      ? domain.details as Record<string, unknown>
      : {}
    await prisma.domain.update({
      where: { id: input.siteId },
      data: {
        status: input.status as typeof workflowStatuses[number],
        ...(input.status === "analyzed" ? { analyzedOn: new Date() } : {}),
        details: { ...details, ...(activity ? { currentActivity: activity } : {}) },
      },
    })
    return workerApiSuccess({ siteId: input.siteId, status: input.status, updated: true })
  }

  return workerApiError("missing_resource", "Provide pageId or siteId.")
}
