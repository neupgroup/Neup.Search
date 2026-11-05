import { NextRequest } from "next/server"
import { jsonResponse, toProjectSlug } from "@/lib/bridge-api"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/neupbot"

// List projects, optionally filtered by a search query.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim()
  const projects = await prisma.domain.findMany({
    where: query
      ? {
          OR: [
            { domain: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { status: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { addedOn: "desc" },
    include: { _count: { select: { pages: true } } },
  })

  return jsonResponse({
    projects: projects.map((project) => {
      const details = readDetails(project.details)
      return {
        id: project.id,
        slug: `${toProjectSlug(project.name || project.domain)}--${project.id}`,
        name: project.name,
        url: details.locations?.[0] || `https://${project.domain}`,
        domain: project.domain,
        status: project.status,
        lastCrawled: project.lastCrawled,
        createdAt: project.addedOn,
        pagesCrawled: details.pagesCrawled ?? project._count.pages,
        internalResourcesFound: details.internalResourcesFound ?? 0,
        externalResourcesFound: details.externalResourcesFound ?? 0,
      }
    }),
  })
}
