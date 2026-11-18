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
  if (typeof input.summary !== "string" || (input.category !== null && typeof input.category !== "string")) return workerApiError("invalid_insight", "summary and category are required.")
  const category = typeof input.category === "string" ? input.category : null

  const page = await prisma.page.findUnique({ where: { id: input.pageId }, select: { data: true, details: true } })
  if (!page) return workerApiError("page_not_found", "Page not found.", 404)
  const currentData = Array.isArray(page.data)
    ? page.data.filter((entry) => !entry || typeof entry !== "object" || !("kind" in entry) || (entry.kind !== "summary" && entry.kind !== "categorization"))
    : []
  const addedOn = new Date().toISOString()
  const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
    ? page.details as Record<string, unknown>
    : {}

  await prisma.page.update({
    where: { id: input.pageId },
    data: {
      category,
      data: [
        ...currentData as Prisma.InputJsonValue[],
        { kind: "summary", summary: input.summary, addedOn },
        { kind: "categorization", category, addedOn },
      ],
      details: { ...details, crawlFlowUpdatedAt: addedOn },
      status: "completed-flow",
      crawlWorkerId: null,
      crawlLeaseUntil: null,
    },
  })
  return workerApiSuccess({ pageId: input.pageId, updated: true })
}
