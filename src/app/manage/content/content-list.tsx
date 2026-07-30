import Link from "next/link"
import { LayoutGrid, Rows3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ContentItem } from "../../../../services/neupbot"
import { ContentFilterBar } from "./content-filter-bar"

function getStatusLabel(item: ContentItem) {
  return item.statusCode ? String(item.statusCode) : item.status
}

function ContentPreview({ item }: { item: ContentItem }) {
  if (item.kind === "image") {
    return (
      <div className="aspect-video overflow-hidden rounded-md border bg-muted">
        <img
          src={item.url}
          alt={item.alt || item.url}
          className="h-full w-full object-contain"
        />
      </div>
    )
  }

  if (item.kind === "video") {
    return (
      <div className="aspect-video overflow-hidden rounded-md border bg-muted">
        <video
          src={item.url}
          className="h-full w-full object-contain"
          controls
          preload="metadata"
        />
      </div>
    )
  }

  if (item.kind === "audio") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border bg-muted p-4">
        <audio src={item.url} controls preload="metadata" className="w-full" />
      </div>
    )
  }

  if (item.kind === "iframe") {
    return (
      <div className="aspect-video overflow-hidden rounded-md border bg-muted">
        <iframe
          src={item.url}
          title={item.url}
          className="h-full w-full"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="aspect-video overflow-hidden rounded-md border bg-muted">
      <div className="flex h-full items-center justify-center p-4 text-sm font-medium uppercase text-muted-foreground">
        {item.fileType}
      </div>
    </div>
  )
}

export function ContentList({
  title,
  description,
  items,
  page,
  pageSize,
  hasNextPage,
  basePath,
  tags,
  search,
  view,
}: {
  title: string
  description: string
  items: ContentItem[]
  page: number
  pageSize: number
  hasNextPage: boolean
  basePath: string
  tags?: Array<{ label: string; href: string }>
  search?: string
  view: "grid" | "list"
}) {
  const buildPageLink = (targetPage: number) => {
    const pageSeparator = basePath.includes("?") ? "&" : "?"
    const searchParam = search ? `&q=${encodeURIComponent(search)}` : ""
    const viewParam = `&view=${view}`
    return `${basePath}${pageSeparator}page=${targetPage}${searchParam}${viewParam}`
  }
  const buildViewLink = (targetView: "grid" | "list") => {
    const pageSeparator = basePath.includes("?") ? "&" : "?"
    const searchParam = search ? `&q=${encodeURIComponent(search)}` : ""
    return `${basePath}${pageSeparator}view=${targetView}${searchParam}`
  }
  const previousPageLink = buildPageLink(Math.max(1, page - 1))
  const nextPageLink = buildPageLink(page + 1)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {tags && tags.length > 0 && (
        <ContentFilterBar tags={tags} />
      )}

      <div className="flex items-center gap-2">
        <Link href={buildViewLink("grid")}>
          <Button variant={view === "grid" ? "default" : "outline"} size="sm">
            <LayoutGrid className="mr-2 h-4 w-4" />
            Grid
          </Button>
        </Link>
        <Link href={buildViewLink("list")}>
          <Button variant={view === "list" ? "default" : "outline"} size="sm">
            <Rows3 className="mr-2 h-4 w-4" />
            List
          </Button>
        </Link>
      </div>

      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No {title.toLowerCase()} found.
        </div>
      )}

      {view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden transition-colors hover:bg-muted/50">
              <CardContent className="space-y-4 p-4">
                <ContentPreview item={item} />

                <div className="space-y-3">
                  <Link
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-sm font-medium hover:text-primary"
                  >
                    {item.url}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-0">
          {items.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === items.length - 1
            const cornerClass = isFirst
              ? "rounded-t-lg rounded-b-none"
              : isLast
                ? "rounded-b-lg rounded-t-none"
                : "rounded-none"

            return (
              <Card key={item.id} className={`w-full border-border/60 transition-colors hover:border-primary hover:bg-muted/40 ${cornerClass}`}>
                <CardContent className="p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {item.url}
                      </Link>
                    </div>
                    <div className="w-full max-w-[180px] shrink-0 sm:w-[180px]">
                      <ContentPreview item={item} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Showing {items.length.toLocaleString()} {items.length === 1 ? "item" : "items"} | Page {page} | {pageSize} per page
      </div>

      <div className="flex justify-end gap-2">
        <Link href={previousPageLink}>
          <Button variant="outline" disabled={page <= 1}>Previous</Button>
        </Link>
        <Link href={nextPageLink}>
          <Button variant="outline" disabled={!hasNextPage}>Next</Button>
        </Link>
      </div>
    </div>
  )
}
