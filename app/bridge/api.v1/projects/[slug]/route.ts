import { NextRequest } from "next/server"
import { jsonError, jsonMethodNotAllowed, jsonResponse, parseResourceSlug, toProjectSlug, withJsonErrors } from "@/lib/bridge-api"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/neupbot"

// Resolve a project using both its URL slug and database ID.
export const GET = withJsonErrors(async (_request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
  const { slug } = await context.params
  const resource = parseResourceSlug(slug)
  if (!resource) return jsonError("Project slug must use the slug--id format.", 400)

  const project = await prisma.domain.findUnique({
    where: { id: resource.id },
    include: { _count: { select: { pages: true } } },
  })
  if (!project) return jsonError("Project not found.", 404)

  const canonicalSlug = toProjectSlug(project.name || project.domain)
  if (canonicalSlug !== resource.slug) return jsonError("Project slug does not match its ID.", 404)

  const details = readDetails(project.details)
  return jsonResponse({
    id: project.id,
    slug: `${canonicalSlug}--${project.id}`,
    name: project.name,
    url: details.locations?.[0] || `https://${project.domain}`,
    domain: project.domain,
    description: details.description || "",
    summary: details.summary || null,
    status: project.status,
    lastCrawled: project.lastCrawled,
    createdAt: project.addedOn,
    pagesCrawled: details.pagesCrawled ?? project._count.pages,
    internalResourcesFound: details.internalResourcesFound ?? 0,
    externalResourcesFound: details.externalResourcesFound ?? 0,
    currentActivity: details.currentActivity || null,
    currentCrawlUrl: details.currentCrawlUrl || null,
  })
})

export const POST = jsonMethodNotAllowed
export const PUT = jsonMethodNotAllowed
export const PATCH = jsonMethodNotAllowed
export const DELETE = jsonMethodNotAllowed
export const OPTIONS = jsonMethodNotAllowed
