import { NextRequest } from "next/server"
import { jsonError, jsonResponse, parseResourceSlug, toProjectSlug } from "@/lib/bridge-api"
import { prisma } from "@/lib/prisma"

// Parse an ISO-compatible datetime query value.
function parseDateTime(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Return pages added to the project during the requested time interval.
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const resource = parseResourceSlug(slug)
  if (!resource) return jsonError("Project slug must use the slug--id format.", 400)

  const fromValue = request.nextUrl.searchParams.get("from")
  const toValue = request.nextUrl.searchParams.get("to")
  const from = parseDateTime(fromValue)
  const to = toValue === null ? new Date() : parseDateTime(toValue)

  if (!fromValue || !from) return jsonError("The from parameter must be a valid datetime.", 400)
  if (toValue !== null && !to) return jsonError("The to parameter must be a valid datetime.", 400)
  if (to && from > to) return jsonError("The from parameter must be earlier than or equal to to.", 400)

  const project = await prisma.domain.findUnique({
    where: { id: resource.id },
    select: { id: true, domain: true, name: true },
  })
  if (!project) return jsonError("Project not found.", 404)

  const canonicalSlug = toProjectSlug(project.name || project.domain)
  if (canonicalSlug !== resource.slug) return jsonError("Project slug does not match its ID.", 404)

  const additions = await prisma.page.findMany({
    where: {
      domainId: project.id,
      addedOn: { gte: from, lte: to ?? new Date() },
    },
    orderBy: { addedOn: "asc" },
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      status: true,
      statusCode: true,
      addedOn: true,
      lastCrawled: true,
    },
  })

  return jsonResponse({
    project: { id: project.id, slug: `${canonicalSlug}--${project.id}` },
    from: from.toISOString(),
    to: (to ?? new Date()).toISOString(),
    count: additions.length,
    additions,
  })
}
