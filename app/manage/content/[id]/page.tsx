import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getContentItemById } from "@/services/neupbot"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function ContentPreview({
  url,
  kind,
  fileType,
  alt,
}: {
  url: string
  kind: string
  fileType: string
  alt?: string
}) {
  if (kind === "image") {
    return <img src={url} alt={alt || url} className="h-full w-full object-cover" />
  }

  if (kind === "video") {
    return <video src={url} className="h-full w-full object-cover" controls preload="metadata" />
  }

  if (kind === "audio") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    )
  }

  if (kind === "iframe") {
    return <iframe src={url} title={url} className="h-full w-full" loading="lazy" />
  }

  return (
    <div className="flex h-full items-center justify-center p-4 text-sm font-medium uppercase text-muted-foreground">
      {fileType}
    </div>
  )
}

export default async function ManageContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const propertyId = readQueryParam(resolvedSearchParams.property)
  const contentItem = await getContentItemById(decodeURIComponent(resolvedParams.id))

  if (!contentItem) {
    notFound()
  }

  const backHref = propertyId
    ? `/manage/content?property=${encodeURIComponent(propertyId)}`
    : "/manage/content"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Content Detail</h1>
          <p className="text-sm text-muted-foreground">Inspect the selected content resource and its source page.</p>
        </div>
        <Link href={backHref} className="text-sm text-primary hover:underline">
          Back to Content
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="aspect-video overflow-hidden bg-muted">
            <ContentPreview
              url={contentItem.url}
              kind={contentItem.kind}
              fileType={contentItem.fileType}
              alt={contentItem.alt}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{contentItem.fileType.toUpperCase()}</Badge>
            <Badge variant={contentItem.statusCode && contentItem.statusCode >= 400 ? "destructive" : "outline"}>
              {contentItem.statusCode ?? contentItem.status}
            </Badge>
          </div>
          <CardTitle className="break-all text-xl">{contentItem.url}</CardTitle>
          <CardDescription>Property: {contentItem.siteUrl}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-medium">Source Page</div>
            <Link href={`/manage/pages/${contentItem.sourcePageId}${propertyId ? `?property=${encodeURIComponent(propertyId)}` : ""}`} className="text-primary hover:underline">
              {contentItem.sourcePageTitle}
            </Link>
          </div>
          <div>
            <div className="font-medium">Source URL</div>
            <div className="break-all text-muted-foreground">{contentItem.sourcePageUrl}</div>
          </div>
          {contentItem.alt ? (
            <div>
              <div className="font-medium">Alt Text</div>
              <div className="text-muted-foreground">{contentItem.alt}</div>
            </div>
          ) : null}
          <div>
            <div className="font-medium">Open Resource</div>
            <Link href={contentItem.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
              {contentItem.url}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
