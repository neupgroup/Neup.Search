import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"

const domainStatuses = ["Requested", "Pending", "Active", "Paused", "Error", "Crawling", "Crawled", "Cancelled", "Stopped"] as const

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
    const page = await prisma.page.findUnique({ where: { id: input.pageId }, select: { details: true } })
    if (!page) return workerApiError("page_not_found", "Page not found.", 404)
    const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
      ? page.details as Record<string, unknown>
      : {}
    await prisma.page.update({
      where: { id: input.pageId },
      data: {
        status: input.status,
        details: { ...details, ...(activity ? { currentActivity: activity } : {}), crawlFlowUpdatedAt: new Date().toISOString() },
        ...(["Error", "Skipped", "reported-errors", "completed-flow"].includes(input.status) ? { crawlWorkerId: null, crawlLeaseUntil: null } : {}),
      },
    })
    return workerApiSuccess({ pageId: input.pageId, status: input.status, updated: true })
  }

  if (typeof input.siteId === "string" && input.siteId.trim()) {
    if (!domainStatuses.includes(input.status as typeof domainStatuses[number])) return workerApiError("invalid_status", "status is not a supported site crawl status.")
    const domain = await prisma.domain.findUnique({ where: { id: input.siteId }, select: { details: true } })
    if (!domain) return workerApiError("site_not_found", "Site not found.", 404)
    const details = domain.details && typeof domain.details === "object" && !Array.isArray(domain.details)
      ? domain.details as Record<string, unknown>
      : {}
    await prisma.domain.update({
      where: { id: input.siteId },
      data: {
        status: input.status as typeof domainStatuses[number],
        details: { ...details, ...(activity ? { currentActivity: activity } : {}) },
      },
    })
    return workerApiSuccess({ siteId: input.siteId, status: input.status, updated: true })
  }

  return workerApiError("missing_resource", "Provide pageId or siteId.")
}
