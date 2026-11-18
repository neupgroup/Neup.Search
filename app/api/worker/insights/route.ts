import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"
import { Prisma } from "@prisma/client"

// Save a completed page summary and category from an authenticated worker.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return workerApiError("invalid_payload", "A JSON object is required.")
  const input = body as Record<string, unknown>
  if (typeof input.pageId !== "string" || !input.pageId.trim()) return workerApiError("invalid_page_id", "pageId is required.")
  if (typeof input.claimedOn !== "string" || Number.isNaN(new Date(input.claimedOn).getTime())) return workerApiError("invalid_claim", "A valid claimedOn timestamp is required.")
  if (typeof input.summary !== "string" || (input.category !== null && typeof input.category !== "string")) return workerApiError("invalid_insight", "summary and category are required.")
  const category = typeof input.category === "string" ? input.category : null

  const claimedOn = new Date(input.claimedOn)
  const page = await prisma.page.findUnique({ where: { id: input.pageId }, select: { details: true, domainId: true, status: true, analyzedOn: true } })
  if (!page) return workerApiError("page_not_found", "Page not found.", 404)
  if (page.status !== "analyzing" || page.analyzedOn?.getTime() !== claimedOn.getTime()) return workerApiError("page_lease_lost", "The page claim is no longer current.", 409)
  const addedOn = new Date().toISOString()
  const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
    ? page.details as Record<string, unknown>
    : {}

  const analyzedOn = new Date()
  const savedPage = await prisma.page.updateMany({
    where: { id: input.pageId, status: "analyzing", analyzedOn: claimedOn, domain: { is: { status: { not: "paused" } } } },
    data: {
      category,
      details: { ...details, summary: input.summary, summaryAddedOn: addedOn, crawlFlowUpdatedAt: addedOn },
      status: "analyzed",
      analyzedOn,
      crawlLeaseUntil: null,
    },
  })
  if (savedPage.count !== 1) return workerApiError("page_lease_lost", "The page claim is no longer current.", 409)
  await prisma.domain.updateMany({ where: { id: page.domainId }, data: { analyzedOn } })
  await prisma.domain.updateMany({ where: { id: page.domainId, status: { in: ["analyzing", "crawled", "analyzed", "indexed"] } }, data: { status: "analyzed" } })
  return workerApiSuccess({ pageId: input.pageId, updated: true })
}
