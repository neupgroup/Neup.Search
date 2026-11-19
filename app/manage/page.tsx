import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Badge } from "@neup/components/ui/badge"
import { Button } from "@neup/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { SiteAppIcon } from "@/components/site-app-icon"
import {
  getPropertyDashboardCount,
  getPropertyDashboardContentSampleCount,
  getPropertyDashboardProperty,
} from "@/services/projects/view"

const overviewMetrics = [
  { key: "totalPages", title: "Pages discovered", description: "Total pages found on this site." },
  { key: "indexedPages", title: "Pages indexed", description: "Pages available in the index." },
  { key: "links", title: "Links found", description: "Outbound links discovered while crawling this site." },
  { key: "crawlErrors", title: "Crawl issues", description: "Redirected, skipped, or failed pages." },
] as const

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// Show the property header placeholder while the property loads.
function ManageDashboardHeaderSkeleton() {
  return (
    <Card className="overflow-hidden border-border/60" aria-label="Loading property" aria-busy="true">
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex min-w-0 items-center gap-5">
          <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardContent>
    </Card>
  )
}

// Show one overview metric placeholder while its count query runs.
function ManageDashboardMetricSkeleton() {
  return (
    <Card className="border-border/60" aria-label="Loading metric" aria-busy="true">
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-36 max-w-full" />
      </CardContent>
    </Card>
  )
}

// Render the property identity and crawl status as soon as its record is available.
async function ManageDashboardHeader({ propertyId }: { propertyId: string }) {
  const property = await getPropertyDashboardProperty(propertyId)

  if (!property) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">The selected project could not be found.</p>
        <Button asChild variant="outline">
          <Link href="/manage/projects">Choose a project</Link>
        </Button>
      </div>
    )
  }

  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex min-w-0 items-center gap-5">
          <SiteAppIcon
            name={property.name}
            url={property.url}
            appIconUrl={property.appIconUrl}
            appIconBackgroundColor={property.appIconBackgroundColor}
            className="h-16 w-16 rounded-xl"
            imageClassName="h-10 w-10"
          />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{property.name || property.url}</h1>
              <Badge variant="outline">{property.status}</Badge>
            </div>
            <a href={property.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-muted-foreground hover:text-primary">
              {property.url}
            </a>
            {property.summary ? <p className="max-w-3xl text-sm text-muted-foreground">{property.summary}</p> : null}
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="text-muted-foreground">Last crawled</div>
          <div className="mt-1 font-medium">{property.lastCrawled || "Never"}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// Render one overview metric as soon as its count query completes.
async function ManageDashboardMetric({
  propertyId,
  metric,
}: {
  propertyId: string
  metric: (typeof overviewMetrics)[number]
}) {
  const value = await getPropertyDashboardCount(propertyId, metric.key)
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardDescription>{metric.title}</CardDescription>
        <CardTitle>{value.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{metric.description}</CardContent>
    </Card>
  )
}

// Render content sample count after the separate page and asset scan completes.
async function ManageDashboardContentMetric({ propertyId }: { propertyId: string }) {
  const contentSamples = await getPropertyDashboardContentSampleCount(propertyId)

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardDescription>Content samples</CardDescription>
        <CardTitle>{contentSamples.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Previewable media and files found.</CardContent>
    </Card>
  )
}

// Show only the selected project's information on its manage dashboard.
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedPropertyId = readQueryParam(resolvedSearchParams.property)

  if (!selectedPropertyId) redirect("/manage/projects")

  return (
    <div className="space-y-8">
      <Suspense key={`property:${selectedPropertyId}`} fallback={<ManageDashboardHeaderSkeleton />}>
        <ManageDashboardHeader propertyId={selectedPropertyId} />
      </Suspense>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Site overview</h2>
          <p className="text-sm text-muted-foreground">Crawl and indexing activity for this site.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {overviewMetrics.map((metric) => (
            <Suspense key={`${metric.key}:${selectedPropertyId}`} fallback={<ManageDashboardMetricSkeleton />}>
              <ManageDashboardMetric propertyId={selectedPropertyId} metric={metric} />
            </Suspense>
          ))}
          <Suspense key={`content:${selectedPropertyId}`} fallback={<ManageDashboardMetricSkeleton />}>
            <ManageDashboardContentMetric propertyId={selectedPropertyId} />
          </Suspense>
        </div>
      </section>
    </div>
  )
}
