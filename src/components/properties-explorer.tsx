/*
::neup.documentation::properties-explorer-component

Reusable property explorer UI for public and manage routes.

::end
*/

import Link from "next/link"
import {
  ArrowRightLeft,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Search,
} from "lucide-react"

import { SearchInput } from "@/components/search-input"
import { SiteAppIcon } from "@/components/site-app-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  ContentItem,
  CrawlIssue,
  ManagedDomain,
  ManagedPage,
  PropertyDashboard,
  PropertyLinkPreview,
} from "../../services/neupbot"

function formatStatusVariant(status: ManagedPage["status"], statusCode: number | null) {
  if (statusCode && statusCode >= 400) return "destructive" as const
  if (status === "Error") return "destructive" as const
  if (status === "Indexed") return "default" as const
  if (status === "Pending") return "outline" as const
  return "secondary" as const
}

function formatStatusLabel(status: ManagedPage["status"], statusCode: number | null) {
  return statusCode && statusCode >= 300 ? String(statusCode) : status
}

function buildManageHref(path: string, selectedPropertyId?: string) {
  if (!selectedPropertyId) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}property=${encodeURIComponent(selectedPropertyId)}`
}

function PropertySelector({
  properties,
  selectedPropertyId,
  basePath,
  cardsPath,
  title,
  description,
  search,
  showSearch,
  selectedCardOnly,
  wrapInCard,
  showSelectField,
  pagination,
}: {
  properties: ManagedDomain[]
  selectedPropertyId?: string
  basePath: string
  cardsPath?: string
  title: string
  description?: string
  search?: string
  showSearch: boolean
  selectedCardOnly: boolean
  wrapInCard: boolean
  showSelectField: boolean
  pagination?: {
    page: number
    totalPages: number
    totalCount: number
    pageSize: number
    basePath: string
    search?: string
    selectedPropertyId?: string
  }
}) {
  const propertyHrefBase = cardsPath || basePath
  const visibleProperties = selectedCardOnly && selectedPropertyId
    ? [
        ...properties.filter((property) => property.id === selectedPropertyId),
        ...properties.filter((property) => property.id !== selectedPropertyId),
      ]
    : properties

  const content = (
    <div className="space-y-4">
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="text-xl font-semibold tracking-tight">{title}</h2> : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}

      {showSelectField ? (
        <form action={basePath} className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              name="property"
              defaultValue={selectedPropertyId || ""}
              className="flex h-11 w-full rounded-lg border border-input bg-white pl-10 pr-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name || property.url}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">View Property</Button>
        </form>
      ) : null}

      {showSearch ? (
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <SearchInput placeholder="Search sites..." />
        </div>
      ) : null}

      <div className="space-y-3">
        {visibleProperties.map((property, index) => {
          const isSelected = property.id === selectedPropertyId
          const isFirst = index === 0
          const isLast = index === visibleProperties.length - 1
          const cornerClass = isFirst
            ? "rounded-t-lg rounded-b-none"
            : isLast
              ? "rounded-b-lg rounded-t-none"
              : "rounded-none"

          return (
            <Link
              key={property.id}
              href={`${propertyHrefBase}?property=${encodeURIComponent(property.id)}`}
            >
              <Card
                className={
                  isSelected
                    ? `w-full border-2 border-primary bg-primary/5 shadow-sm transition-colors hover:bg-primary/5 ${cornerClass}`
                    : `w-full border-border/60 transition-colors hover:bg-muted/40 ${cornerClass}`
                }
              >
                <CardContent className="p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <SiteAppIcon
                        name={property.name}
                        url={property.url}
                        appIconUrl={property.appIconUrl}
                        appIconBackgroundColor={property.appIconBackgroundColor}
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold">{property.name || property.url}</div>
                        <div className="truncate text-sm text-muted-foreground">{property.url}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isSelected ? <Badge>Selected</Badge> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {visibleProperties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {search ? "No sites matched your search." : "No sites available."}
        </div>
      ) : null}

      {pagination && pagination.totalCount > 0 ? (
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} | {pagination.totalCount.toLocaleString()} sites
          </div>
          <div className="flex gap-2">
            <Link
              href={buildPaginationHref({
                basePath: pagination.basePath,
                page: Math.max(1, pagination.page - 1),
                search: pagination.search,
                selectedPropertyId: pagination.selectedPropertyId,
              })}
            >
              <Button variant="outline" disabled={pagination.page <= 1}>Previous</Button>
            </Link>
            <Link
              href={buildPaginationHref({
                basePath: pagination.basePath,
                page: Math.min(pagination.totalPages, pagination.page + 1),
                search: pagination.search,
                selectedPropertyId: pagination.selectedPropertyId,
              })}
            >
              <Button variant="outline" disabled={pagination.page >= pagination.totalPages}>Next</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )

  if (!wrapInCard) return content

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-6">{content}</CardContent>
    </Card>
  )
}

function buildPaginationHref({
  basePath,
  page,
  search,
  selectedPropertyId,
}: {
  basePath: string
  page: number
  search?: string
  selectedPropertyId?: string
}) {
  const params = new URLSearchParams()
  params.set("page", String(page))
  if (search) {
    params.set("q", search)
  }
  if (selectedPropertyId) {
    params.set("property", selectedPropertyId)
  }
  return `${basePath}?${params.toString()}`
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string
  value: number
  description: string
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle>{value.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  )
}

function PagesSection({
  title,
  description,
  pages,
  selectedPropertyId,
}: {
  title: string
  description: string
  pages: ManagedPage[]
  selectedPropertyId?: string
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No pages available.</div>
        ) : (
          pages.map((page) => (
            <div key={page.id} className="rounded-lg border border-border/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <Link
                    href={buildManageHref(`/manage/pages/${page.id}`, selectedPropertyId)}
                    className="block truncate font-semibold hover:underline"
                  >
                    {page.title}
                  </Link>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 break-all text-sm text-muted-foreground hover:text-primary"
                  >
                    <span>{page.url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>
                <Badge variant={formatStatusVariant(page.status, page.statusCode)} className="w-fit shrink-0">
                  {formatStatusLabel(page.status, page.statusCode)}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function CrawlErrorsSection({
  issues,
  selectedPropertyId,
}: {
  issues: CrawlIssue[]
  selectedPropertyId?: string
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-xl">Crawl Errors</CardTitle>
        <CardDescription>Pages on this property that redirected, failed, or were skipped.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No crawl errors found.</div>
        ) : (
          issues.map((issue) => (
            <Link
              key={issue.id}
              href={buildManageHref(`/manage/pages/${issue.id}`, selectedPropertyId)}
              className="block rounded-lg border border-border/60 p-4 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="font-semibold">{issue.title}</div>
                  <div className="break-all text-sm text-muted-foreground">{issue.url}</div>
                </div>
                <Badge variant="destructive">{issue.statusCode ?? issue.type}</Badge>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function LinksSection({ links }: { links: PropertyLinkPreview[] }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-xl">Links</CardTitle>
        <CardDescription>Latest discovered inbound and outbound links connected to this property.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No links found.</div>
        ) : (
          links.map((link) => (
            <div key={link.id} className="rounded-lg border border-border/60 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>{link.sourceDomain}</span>
                <span>to</span>
                <span>{link.targetDomain}</span>
              </div>
              <div className="mt-3 space-y-2">
                <a href={link.sourceUrl} target="_blank" rel="noreferrer" className="block break-all text-sm font-medium hover:text-primary">
                  {link.sourceUrl}
                </a>
                <a href={link.targetUrl} target="_blank" rel="noreferrer" className="block break-all text-sm text-muted-foreground hover:text-primary">
                  {link.targetUrl}
                </a>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {link.sourceType ? <Badge variant="outline">{link.sourceType}</Badge> : null}
                  {link.anchorText ? <span>Anchor: {link.anchorText}</span> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function ContentSection({
  content,
  selectedPropertyId,
}: {
  content: ContentItem[]
  selectedPropertyId?: string
}) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-xl">Content Samples</CardTitle>
        <CardDescription>Indexed media and file resources discovered for this property.</CardDescription>
      </CardHeader>
      <CardContent>
        {content.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No content samples found.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {content.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{item.fileType.toUpperCase()}</Badge>
                  <Badge variant={item.statusCode && item.statusCode >= 400 ? "destructive" : "outline"}>
                    {item.statusCode ?? item.status}
                  </Badge>
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm font-medium hover:text-primary">
                  {item.url}
                </a>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>{item.kind}</span>
                  </div>
                  <Link href={buildManageHref(`/manage/pages/${item.sourcePageId}`, selectedPropertyId)} className="block hover:text-primary">
                    Source: {item.sourcePageTitle}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PropertyDashboardView({
  dashboard,
  selectedPropertyId,
}: {
  dashboard: PropertyDashboard
  selectedPropertyId?: string
}) {
  const { property, counts } = dashboard

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>{property.name || property.url}</CardTitle>
              </div>
              <CardDescription className="text-sm">{property.url}</CardDescription>
              {property.summary ? <p className="max-w-3xl text-sm text-muted-foreground">{property.summary}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{property.status}</Badge>
              {property.lastCrawled ? <Badge variant="secondary">Last crawled: {property.lastCrawled}</Badge> : null}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Pages" value={counts.totalPages} description="All crawled records for this property." />
        <StatCard title="Indexed Pages" value={counts.indexedPages} description="Pages currently marked as indexed." />
        <StatCard title="Links" value={counts.links} description="Inbound and outbound links tied to this property." />
        <StatCard title="Crawl Errors" value={counts.crawlErrors} description="Redirect, skipped, and failed crawl results." />
        <StatCard title="Content Samples" value={counts.contentSamples} description="Previewable resources found for this property." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PagesSection
          title="Pages"
          description="Latest pages discovered for this property."
          pages={dashboard.recentPages}
          selectedPropertyId={selectedPropertyId}
        />
        <PagesSection
          title="Indexed Pages"
          description="Recently crawled pages that are in indexed state."
          pages={dashboard.indexedPages}
          selectedPropertyId={selectedPropertyId}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CrawlErrorsSection issues={dashboard.crawlErrors} selectedPropertyId={selectedPropertyId} />
        <LinksSection links={dashboard.links} />
      </div>

      <ContentSection content={dashboard.content} selectedPropertyId={selectedPropertyId} />
    </div>
  )
}

export function PropertiesExplorer({
  properties,
  selectedPropertyId,
  dashboard,
  basePath,
  cardsPath,
  title = "Choose Property",
  description = "Select a domain to view its pages, indexed pages, crawl errors, links, and content samples.",
  search,
  showSearch = false,
  showDashboard = true,
  selectedCardOnly = false,
  wrapSelectorInCard = true,
  showSelectField = true,
  pagination,
}: {
  properties: ManagedDomain[]
  selectedPropertyId?: string
  dashboard: PropertyDashboard | null
  basePath: string
  cardsPath?: string
  title?: string
  description?: string
  search?: string
  showSearch?: boolean
  showDashboard?: boolean
  selectedCardOnly?: boolean
  wrapSelectorInCard?: boolean
  showSelectField?: boolean
  pagination?: {
    page: number
    totalPages: number
    totalCount: number
    pageSize: number
    basePath: string
    search?: string
    selectedPropertyId?: string
  }
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Property Explorer</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose a domain and inspect its pages, indexed pages, links, crawl errors, and content from one place.
        </p>
      </div>

      <PropertySelector
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        basePath={basePath}
        cardsPath={cardsPath}
        title={title}
        description={description}
        search={search}
        showSearch={showSearch}
        selectedCardOnly={selectedCardOnly}
        wrapInCard={wrapSelectorInCard}
        showSelectField={showSelectField}
        pagination={pagination}
      />

      {showDashboard && dashboard ? <PropertyDashboardView dashboard={dashboard} selectedPropertyId={selectedPropertyId} /> : null}
    </div>
  )
}
