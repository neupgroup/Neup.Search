import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"
import { parseResourceSlug, toProjectSlug } from "@/lib/bridge-api"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/neupbot"

// Render the project details page for a validated slug and ID pair.
export default async function ProjectApiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
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
          <CardTitle>{project.name || project.domain}</CardTitle>
          <CardDescription>{details.summary || details.description || project.domain}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><strong>URL:</strong> <a href={details.locations?.[0] || `https://${project.domain}`} className="underline">{details.locations?.[0] || `https://${project.domain}`}</a></p>
          <p><strong>Status:</strong> {project.status}</p>
          <p><strong>Pages:</strong> {details.pagesCrawled ?? project._count.pages}</p>
          <p><strong>Last crawled:</strong> {project.lastCrawled?.toISOString() || "Never"}</p>
          <p><strong>Created:</strong> {project.addedOn.toISOString()}</p>
          <p><strong>Current activity:</strong> {details.currentActivity || "None"}</p>
          <nav className="flex gap-4 pt-2">
            <Link className="underline" href={`/bridge/api.v1/projects/${canonicalSlug}/status`}>Project status</Link>
            <Link className="underline" href={`/bridge/api.v1/projects/${canonicalSlug}/additions?from=${encodeURIComponent(project.addedOn.toISOString())}`}>Project additions</Link>
          </nav>
        </CardContent>
      </Card>
    </main>
  )
}
