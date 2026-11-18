import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"
import { completeDomainCrawlIfIdle } from "@/services/neupbot"

const workerStatuses = ["Starting", "Idle", "Working", "Stopped", "Error"] as const

// Persist the authenticated worker's current status and activity.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return workerApiError("invalid_payload", "A JSON object is required.")
  const input = body as Record<string, unknown>
  if (input.action === "complete-if-idle") {
    if (typeof input.siteId !== "string" || !input.siteId.trim()) return workerApiError("invalid_site_id", "siteId is required to finalize a crawl.")
    const completed = await completeDomainCrawlIfIdle(input.siteId)
    return workerApiSuccess({ siteId: input.siteId, completed })
  }
  if (typeof input.workerId !== "string" || !input.workerId.trim()) return workerApiError("invalid_worker_id", "workerId is required.")
  if (typeof input.status !== "string" || !workerStatuses.includes(input.status as typeof workerStatuses[number])) return workerApiError("invalid_status", "A valid worker status is required.")

  const activity = typeof input.activity === "string" ? input.activity : "Worker status updated."
  const siteId = typeof input.siteId === "string" ? input.siteId : null
  const siteUrl = typeof input.siteUrl === "string" ? input.siteUrl : null
  const currentUrl = typeof input.currentUrl === "string" ? input.currentUrl : null
  if (typeof input.pageId === "string" && input.status === "Working" && typeof input.claimedOn === "string" && (input.pageWorkflowStatus === "crawling" || input.pageWorkflowStatus === "analyzing")) {
    const claimedOn = new Date(input.claimedOn)
    if (!Number.isNaN(claimedOn.getTime())) {
      await prisma.page.updateMany({
        where: {
          id: input.pageId,
          status: input.pageWorkflowStatus,
          ...(input.pageWorkflowStatus === "crawling" ? { crawledOn: claimedOn } : { analyzedOn: claimedOn }),
        },
        data: { crawlLeaseUntil: new Date(Date.now() + 5 * 60_000) },
      })
    }
  }
  await prisma.crawlerWorker.upsert({
    where: { id: input.workerId },
    create: { id: input.workerId, status: input.status as typeof workerStatuses[number], activity, siteId, siteUrl, currentUrl, lastSeenAt: new Date() },
    update: { status: input.status as typeof workerStatuses[number], activity, siteId, siteUrl, currentUrl, lastSeenAt: new Date() },
  })
  return workerApiSuccess({ workerId: input.workerId, updated: true })
}
