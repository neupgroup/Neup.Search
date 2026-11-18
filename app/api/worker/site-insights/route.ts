import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeWorkerRequest, workerApiError, workerApiSuccess } from "@/lib/worker-api"

// Save AI-generated site profile details submitted by an analysis worker.
export async function POST(request: NextRequest) {
  const unauthorized = authorizeWorkerRequest(request)
  if (unauthorized) return unauthorized

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return workerApiError("invalid_payload", "A JSON object is required.")
  const input = body as Record<string, unknown>
  if (typeof input.siteId !== "string" || !input.siteId.trim()) return workerApiError("invalid_site_id", "siteId is required.")
  if (typeof input.name !== "string" || typeof input.summary !== "string") return workerApiError("invalid_site_insight", "name and summary are required strings.")
  if (input.category !== null && typeof input.category !== "string") return workerApiError("invalid_site_category", "category must be a string or null.")

  const domain = await prisma.domain.findUnique({ where: { id: input.siteId }, select: { name: true, details: true } })
  if (!domain) return workerApiError("site_not_found", "Site not found.", 404)
  const details = domain.details && typeof domain.details === "object" && !Array.isArray(domain.details)
    ? domain.details as Record<string, unknown>
    : {}
  const faviconUrl = typeof input.faviconUrl === "string" ? input.faviconUrl : null
  const logoUrl = typeof input.logoUrl === "string" ? input.logoUrl : null

  await prisma.domain.update({
    where: { id: input.siteId },
    data: {
      name: input.name.trim() || domain.name,
      categories: input.category as string | null,
      details: {
        ...details,
        ...(input.summary.trim() ? { summary: input.summary.trim() } : {}),
        siteProfileGeneratedAt: new Date().toISOString(),
        ...(logoUrl ? { logoUrl } : {}),
        ...((faviconUrl || logoUrl) ? { appIconUrl: faviconUrl || logoUrl } : {}),
      },
    },
  })
  return workerApiSuccess({ siteId: input.siteId, updated: true })
}
