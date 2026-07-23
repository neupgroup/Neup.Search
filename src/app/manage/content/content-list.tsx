import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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

export function ContentList({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: ContentItem[]
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="text-sm text-muted-foreground">
        {items.length.toLocaleString()} {items.length === 1 ? "item" : "items"}
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
    </div>
  )
}
