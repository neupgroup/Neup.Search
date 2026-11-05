import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"
import { parseResourceSlug, toProjectSlug } from "@/lib/bridge-api"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/neupbot"

// Render crawl status for a validated project slug and ID pair.
export default async function ProjectApiStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resource = parseResourceSlug(slug)
  if (!resource) notFound()

  const project = await prisma.domain.findUnique({
    where: { id: resource.id },
    include: { _count: { select: { pages: true } } },
  })
  if (!project || toProjectSlug(project.name || project.domain) !== resource.slug) notFound()

  const details = readDetails(project.details)
  const canonicalSlug = `${toProjectSlug(project.name || project.domain)}--${project.id}`

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{project.name || project.domain} status</CardTitle>
          <CardDescription>Current crawl state and indexed resource counts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><strong>Status:</strong> {project.status}</p>
          <p><strong>Pages crawled:</strong> {details.pagesCrawled ?? project._count.pages}</p>
          <p><strong>Internal resources:</strong> {details.internalResourcesFound ?? 0}</p>
          <p><strong>External resources:</strong> {details.externalResourcesFound ?? 0}</p>
          <p><strong>Current activity:</strong> {details.currentActivity || "None"}</p>
          <p><strong>Current URL:</strong> {details.currentCrawlUrl || "None"}</p>
          <p><strong>Last crawled:</strong> {project.lastCrawled?.toISOString() || "Never"}</p>
          <Link className="underline pt-2" href={`/bridge/api.v1/projects/${canonicalSlug}`}>Back to project</Link>
        </CardContent>
      </Card>
    </main>
  )
}
