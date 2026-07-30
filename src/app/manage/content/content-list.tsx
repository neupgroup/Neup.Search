import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ContentItem } from "../../../../services/neupbot"
import { ContentFilterBar } from "./content-filter-bar"

function ContentPreview({ item }: { item: ContentItem }) {
  if (item.kind === "image") {
    return (
      <div className="aspect-video overflow-hidden bg-muted">
        <img
          src={item.url}
          alt={item.alt || item.url}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  if (item.kind === "video") {
    return (
      <div className="aspect-video overflow-hidden bg-muted">
        <video
          src={item.url}
          className="h-full w-full object-cover"
          controls
          preload="metadata"
        />
      </div>
    )
  }

  if (item.kind === "audio") {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted p-4">
        <audio src={item.url} controls preload="metadata" className="w-full" />
      </div>
    )
  }

  if (item.kind === "iframe") {
    return (
      <div className="aspect-video overflow-hidden bg-muted">
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
    <div className="aspect-video overflow-hidden bg-muted">
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
  propertyId,
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
  propertyId?: string
}) {
  const buildPageLink = (targetPage: number) => {
    const pageSeparator = basePath.includes("?") ? "&" : "?"
    const searchParam = search ? `&q=${encodeURIComponent(search)}` : ""
    return `${basePath}${pageSeparator}page=${targetPage}${searchParam}`
  }
  const previousPageLink = buildPageLink(Math.max(1, page - 1))
  const nextPageLink = buildPageLink(page + 1)
  const buildDetailLink = (itemId: string) => {
    if (!propertyId) return `/manage/content/${encodeURIComponent(itemId)}`

    const query = new URLSearchParams()
    query.set("property", propertyId)
    return `/manage/content/${encodeURIComponent(itemId)}?${query.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {tags && tags.length > 0 && (
        <ContentFilterBar tags={tags} />
      )}

      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No {title.toLowerCase()} found.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link key={item.id} href={buildDetailLink(item.id)} className="block">
            <Card className="overflow-hidden transition-colors hover:bg-muted/50">
              <CardContent className="p-0">
                <ContentPreview item={item} />

                <div className="space-y-3 p-4">
                  <div className="block break-all text-sm font-medium">
                    {item.url}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Showing {items.length.toLocaleString()} {items.length === 1 ? "item" : "items"} | Page {page} | {pageSize} per page
        </div>

        <div className="flex items-center gap-2">
          <Link href={previousPageLink}>
            <Button variant="outline" disabled={page <= 1}>Previous</Button>
          </Link>
          <Link href={nextPageLink}>
            <Button variant="outline" disabled={!hasNextPage}>Next</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
