import Link from "next/link"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SearchInput } from "@/components/search-input"
import type { ContentItem } from "../../../../services/neupbot"

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
}) {
  const buildPageLink = (targetPage: number) => {
    const pageSeparator = basePath.includes("?") ? "&" : "?"
    const searchParam = search ? `&q=${encodeURIComponent(search)}` : ""
    return `${basePath}${pageSeparator}page=${targetPage}${searchParam}`
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
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Link key={tag.href} href={tag.href}>
              <Badge variant="outline" className="px-3 py-1 text-sm transition-colors hover:bg-muted">
                {tag.label}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="relative flex-1 md:grow-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <SearchInput placeholder="Search content..." />
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {items.length.toLocaleString()} {items.length === 1 ? "item" : "items"} | Page {page} | {pageSize} per page
      </div>

      {items.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No {title.toLowerCase()} found.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden transition-colors hover:bg-muted/50">
            <CardContent className="space-y-4 p-4">
              <ContentPreview item={item} />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{item.fileType.toUpperCase()}</Badge>
                  <Badge variant={item.statusCode && item.statusCode >= 400 ? "destructive" : "outline"}>
                    {getStatusLabel(item)}
                  </Badge>
                </div>

                <Link
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-sm font-medium hover:text-primary"
                >
                  {item.url}
                </Link>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="break-all">Site: {item.siteUrl}</div>
                  <div>
                    Source:{" "}
                    <Link href={item.sourcePageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                      {item.sourcePageTitle}
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
