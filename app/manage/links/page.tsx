/*
::neup.documentation::manage-links-page

Manage route for browsing crawled links by type and property.

::end
*/

import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLink, Link2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { LinksFilterBar } from "./links-filter-bar"
import {
  getManagedLinks,
  type ManagedLinkItem,
  type ManagedLinkType,
} from "../../../../services/neupbot"

const validLinkTypes: ManagedLinkType[] = ["incoming", "outgoing", "internal", "tel", "mailto"]

const linkTypeTabs: Array<{ label: string; type?: ManagedLinkType }> = [
  { label: "All" },
  { label: "Incoming", type: "incoming" },
  { label: "Outgoing", type: "outgoing" },
  { label: "Internal", type: "internal" },
  { label: "Tel", type: "tel" },
  { label: "Mailto", type: "mailto" },
]

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readPageParam(value: string | string[] | undefined, fallback: number) {
  const rawValue = readValue(value)
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function buildLinksPath(params: {
  type?: ManagedLinkType
  propertyId?: string
  search?: string
  page?: number
}) {
  const query = new URLSearchParams()
  if (params.type) {
    query.set("type", params.type)
  }
  if (params.propertyId) {
    query.set("property", params.propertyId)
  }
  if (params.search) {
    query.set("q", params.search)
  }
  if (params.page && params.page > 1) {
    query.set("page", String(params.page))
  }

  const queryString = query.toString()
  return queryString ? `/manage/links?${queryString}` : "/manage/links"
}

function buildPageDetailHref(pageId: string, propertyId?: string) {
  if (!propertyId) return `/manage/pages/${pageId}`
  return `/manage/pages/${pageId}?property=${encodeURIComponent(propertyId)}`
}

function formatTypeLabel(type: ManagedLinkType) {
  if (type === "incoming") return "Incoming"
  if (type === "mailto") return "Mailto"
  if (type === "tel") return "Tel"
  if (type === "internal") return "Internal"
  return "Outgoing"
}

function getBadgeVariant(type: ManagedLinkType) {
  if (type === "incoming") return "default" as const
  if (type === "internal") return "default" as const
  if (type === "outgoing") return "secondary" as const
  return "outline" as const
}

function LinksList({
  links,
  propertyId,
}: {
  links: ManagedLinkItem[]
  propertyId?: string
}) {
  if (links.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center text-base text-muted-foreground">
          No links found for this filter.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-0">
      {links.map((link, index) => {
        const isFirst = index === 0
        const isLast = index === links.length - 1
        const cornerClass = isFirst
          ? "rounded-t-lg rounded-b-none"
          : isLast
            ? "rounded-b-lg rounded-t-none"
            : "rounded-none"

        return (
          <Card key={link.id} className={`border-border/60 ${cornerClass}`}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getBadgeVariant(link.type)}>{formatTypeLabel(link.type)}</Badge>
                      <Link
                        href={buildPageDetailHref(link.sourcePageId, propertyId)}
                        className="font-semibold hover:underline"
                      >
                        {link.sourcePageTitle}
                      </Link>
                    </div>
                    <a
                      href={link.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 break-all text-sm text-muted-foreground hover:text-primary"
                    >
                      <span>{link.sourceUrl}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {link.firstCrawlOn.toLocaleDateString()}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Target
                  </div>
                  <div className="mt-1 break-all text-sm font-medium">{link.targetUrl}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>From: {link.sourceDomain}</span>
                    {link.targetDomain ? <span>To: {link.targetDomain}</span> : null}
                    {link.anchorText ? <span>Anchor: {link.anchorText}</span> : null}
                    {link.titleText ? <span>Title: {link.titleText}</span> : null}
                    {link.rel ? <span>Rel: {link.rel}</span> : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export const dynamic = "force-dynamic"

export default async function ManageLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const typeValue = readValue(resolvedSearchParams.type)
  const type = typeValue as ManagedLinkType | undefined
  const propertyId = readValue(resolvedSearchParams.property)
  const search = readValue(resolvedSearchParams.q)
  const page = readPageParam(resolvedSearchParams.page, 1)

  if (typeValue && (!type || !validLinkTypes.includes(type))) {
    notFound()
  }

  const pagination = await getManagedLinks({
    propertyId,
    type,
    page,
    pageSize: 20,
    search,
  })

  const previousPage = Math.max(1, pagination.page - 1)
  const nextPage = Math.min(pagination.totalPages, pagination.page + 1)

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold leading-none tracking-tight">Links</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse incoming, outgoing, internal, tel, and mailto links discovered from crawled pages.
            {propertyId ? " Showing links from the selected property only." : ""}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <LinksFilterBar
            tags={linkTypeTabs.map((tab) => ({
              label: tab.label,
              href: buildLinksPath({ type: tab.type, propertyId, search }),
            }))}
          />
        </div>
      </div>

      <LinksList links={pagination.links} propertyId={propertyId} />

      {pagination.totalCount > 0 ? (
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} | {pagination.totalCount.toLocaleString()} links
          </div>
          <div className="flex justify-end gap-2">
            <Link href={buildLinksPath({ type, propertyId, search, page: previousPage })}>
              <Button variant="outline" disabled={pagination.page <= 1}>Previous</Button>
            </Link>
            <Link href={buildLinksPath({ type, propertyId, search, page: nextPage })}>
              <Button variant="outline" disabled={pagination.page >= pagination.totalPages}>Next</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
