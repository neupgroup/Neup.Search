import Link from "next/link"
import { Suspense } from "react"
import { ArrowDownWideNarrow, ArrowRight, Globe, Plus, Search } from "lucide-react"
import { Badge } from "@neup/components/ui/badge"
import { Button } from "@neup/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@neup/components/ui/table"
import { SearchInput } from "@/components/search-input"
import { getManagedSitesPage, type ManagedSiteStatusFilter } from "@/services/projects/list"
import { pauseSiteCrawl, resumePausedSiteCrawl } from "@/app/manage/sites/actions"

export const dynamic = "force-dynamic"

const siteStatusFilters: Array<{ value: ManagedSiteStatusFilter; label: string }> = [
  { value: "all", label: "All sites" },
  { value: "requesting", label: "Requesting indexing" },
  { value: "requested", label: "Queued" },
  { value: "paused", label: "Paused" },
  { value: "crawling", label: "Crawling" },
  { value: "indexed", label: "Indexed" },
  { value: "other", label: "Other status" },
]

// Read one query parameter while supporting repeated query values.
function readQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// Parse a positive page number from the URL.
function readPageNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(readQueryValue(value) || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

// Return a readable status label for the site row.
function formatSiteStatus(status: string): string {
  const labels: Record<string, string> = {
    requesting: "Requesting indexing",
    requested: "Queued",
    toCrawl: "Queued",
    paused: "Paused",
    crawling: "Crawling",
    crawled: "Crawled",
    analyzing: "Analyzing",
    analyzed: "Analyzed",
    indexed: "Indexed",
    discovered: "Discovered",
    unlisted: "Unlisted",
    deleting: "Deleting",
  }
  return labels[status] || status
}

// Choose a status color that matches the site's current workflow.
function getSiteStatusConvey(status: string): "success" | "warning" | "informative" | "danger" {
  if (status === "indexed" || status === "analyzed" || status === "crawled") return "success"
  if (status === "requesting" || status === "requested" || status === "toCrawl" || status === "paused") return "warning"
  if (status === "unlisted" || status === "deleting") return "danger"
  return "informative"
}

// Build a filter link while preserving the search and current page context.
function buildSitesHref(status: ManagedSiteStatusFilter, search?: string, page = 1, propertyId?: string): string {
  const query = new URLSearchParams()
  if (propertyId) query.set("property", propertyId)
  if (status !== "all") query.set("status", status)
  if (search) query.set("q", search)
  if (page > 1) query.set("page", String(page))
  const queryString = query.toString()
  return queryString ? `/manage/sites?${queryString}` : "/manage/sites"
}

// Build the site detail link with the selected site also available as the property query.
function buildSiteDetailHref(siteId: string): string {
  const query = new URLSearchParams({ property: siteId })
  return `/manage/sites/${siteId}?${query.toString()}`
}

// Render the sortable-by-date sites table and status filters.
export default async function ManageSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = readQueryValue(params.q)?.trim() || undefined
  const requestedStatus = readQueryValue(params.status)
  const status = siteStatusFilters.some((filter) => filter.value === requestedStatus)
    ? requestedStatus as ManagedSiteStatusFilter
    : "all"
  const pagination = await getManagedSitesPage({ search, status, page: readPageNumber(params.page), pageSize: 20 })
  const propertyId = readQueryValue(params.property) || pagination.sites[0]?.id

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Sites</h1>
          <p className="text-sm text-muted-foreground">Track sites through indexing and manage their crawl status.</p>
        </div>
        <Link href="/manage/projects/add">
          <Button><Plus className="mr-2 h-4 w-4" /> Add site</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {siteStatusFilters.filter((filter) => !["all", "other"].includes(filter.value)).map((filter) => (
          <Link key={filter.value} href={buildSitesHref(filter.value, search, 1, propertyId)}>
            <Card className={`h-full transition-colors hover:border-primary ${status === filter.value ? "border-primary bg-primary/5" : ""}`}>
              <CardContent className="flex items-center justify-between p-4">
                <span className="text-sm font-medium">{filter.label}</span>
                <span className="text-2xl font-semibold">{pagination.filters[filter.value]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All sites</CardTitle>
            <CardDescription>Newest sites appear first, based on when they were added.</CardDescription>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Suspense fallback={null}><SearchInput placeholder="Search sites..." preserveParams={{ property: propertyId }} /></Suspense>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav className="flex flex-wrap gap-2" aria-label="Filter sites by status">
            {siteStatusFilters.map((filter) => (
              <Link
                key={filter.value}
                href={buildSitesHref(filter.value, search, 1, propertyId)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted ${status === filter.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {filter.label} <span className="ml-1 tabular-nums">{pagination.filters[filter.value]}</span>
              </Link>
            ))}
          </nav>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center gap-1"><ArrowDownWideNarrow className="h-4 w-4" />Newest first</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.sites.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No sites match this view.</TableCell></TableRow>
              ) : pagination.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    <Link href={buildSiteDetailHref(site.id)} className="group flex min-w-56 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Globe className="h-5 w-5" /></span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:underline">{site.name || site.url}</span>
                        <span className="block truncate text-xs text-muted-foreground">{site.url}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell><Badge convey={getSiteStatusConvey(site.status)}>{formatSiteStatus(site.status)}</Badge></TableCell>
                  <TableCell className="tabular-nums">{site.pagesCrawled?.toLocaleString() ?? "0"}</TableCell>
                  <TableCell className="whitespace-nowrap">{site.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    {site.status === "paused" ? (
                      <form action={resumePausedSiteCrawl} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="siteId" value={site.id} />
                        <Button type="submit" size="sm" variant="outlined">Resume</Button>
                        <Link href={buildSiteDetailHref(site.id)} aria-label={`Open ${site.name || site.url}`}><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
                      </form>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {!(["unlisted", "deleting"].includes(site.status)) && (
                          <form action={pauseSiteCrawl}>
                            <input type="hidden" name="siteId" value={site.id} />
                            <Button type="submit" size="sm" variant="outlined">Pause</Button>
                          </form>
                        )}
                        <Link href={buildSiteDetailHref(site.id)} aria-label={`Open ${site.name || site.url}`}><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>{pagination.totalCount.toLocaleString()} sites · Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <Link href={buildSitesHref(status, search, Math.max(1, pagination.page - 1), propertyId)} aria-disabled={pagination.page <= 1}>
                <Button variant="outline" size="sm" disabled={pagination.page <= 1}>Previous</Button>
              </Link>
              <Link href={buildSitesHref(status, search, Math.min(pagination.totalPages, pagination.page + 1), propertyId)} aria-disabled={pagination.page >= pagination.totalPages}>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages}>Next</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
