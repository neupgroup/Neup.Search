import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { ContentList } from "./content-list"
import { ContentFilterBar } from "./content-filter-bar"
import {
  classifyContentSlug,
  getContentItemsByFileTypeSlug,
  type ContentKind,
} from "@/services/neupbot"

const contentTags: Array<{ label: string; href: string }> = [
  { label: "image", href: "/manage/content?type=image" },
  { label: "video", href: "/manage/content?type=video" },
  { label: "audio", href: "/manage/content?type=audio" },
  { label: "iframe", href: "/manage/content?type=iframe" },
  { label: "txt", href: "/manage/content?extension=txt" },
  { label: "png", href: "/manage/content?extension=png" },
  { label: "jpg", href: "/manage/content?extension=jpg" },
  { label: "svg", href: "/manage/content?extension=svg" },
  { label: "webp", href: "/manage/content?extension=webp" },
  { label: "mp4", href: "/manage/content?extension=mp4" },
  { label: "mp3", href: "/manage/content?extension=mp3" },
  { label: "pdf", href: "/manage/content?extension=pdf" },
  { label: "json", href: "/manage/content?extension=json" },
  { label: "xml", href: "/manage/content?extension=xml" },
  { label: "csv", href: "/manage/content?extension=csv" },
]

function formatKindLabel(kind: ContentKind) {
  if (kind === "image") return "Images"
  if (kind === "video") return "Videos"
  if (kind === "audio") return "Audio"
  if (kind === "iframe") return "Iframes"
  if (kind === "text") return "Text Files"
  return "Documents"
}

function formatContentTitle(kind?: ContentKind, fileType?: string) {
  if (fileType && kind) {
    return `${fileType.toUpperCase()} ${formatKindLabel(kind)}`
  }

  if (kind) {
    return formatKindLabel(kind)
  }

  return "Content"
}

function readFilterValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function appendQueryParam(path: string, key: string, value?: string) {
  if (!value) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}${key}=${encodeURIComponent(value)}`
}

function readPageParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : 1

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1
}

export default async function ManageContentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const type = readFilterValue(resolvedSearchParams.type)
  const extension = readFilterValue(resolvedSearchParams.extension)
  const search = readFilterValue(resolvedSearchParams.q)
  const propertyId = readFilterValue(resolvedSearchParams.property)
  const slug = extension || type || "content"
  const contentTarget = classifyContentSlug(slug)

  if (!contentTarget) {
    notFound()
  }

  if (type && (!contentTarget.kind || contentTarget.fileType)) {
    notFound()
  }

  if (extension && !contentTarget.fileType) {
    notFound()
  }

  const title = formatContentTitle(contentTarget.kind, contentTarget.fileType)
  const rawBasePath = extension
    ? `/manage/content?extension=${encodeURIComponent(extension)}`
    : type
      ? `/manage/content?type=${encodeURIComponent(type)}`
      : "/manage/content"
  const basePath = appendQueryParam(rawBasePath, "property", propertyId)
  const tags = contentTags.map((tag) => ({
    ...tag,
    href: appendQueryParam(tag.href, "property", propertyId),
  }))
  const page = readPageParam(resolvedSearchParams.page)
  const description = contentTarget.fileType
    ? `Indexed ${contentTarget.fileType.toUpperCase()} files found in crawled pages.`
    : contentTarget.kind
      ? `All indexed ${contentTarget.kind} files found in crawled pages.`
      : "All indexed media files found in crawled pages."

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ContentFilterBar tags={tags} />
      <Suspense key={`${slug}:${page}:${search || ""}`} fallback={<ContentResultsSkeleton />}>
        <ContentResults slug={slug} page={page} search={search} basePath={basePath} propertyId={propertyId} title={title} description={description} />
      </Suspense>
    </div>
  )
}

// Render content cards and pagination when the filtered content query completes.
async function ContentResults({ slug, page, search, basePath, propertyId, title, description }: {
  slug: string
  page: number
  search?: string
  basePath: string
  propertyId?: string
  title: string
  description: string
}) {
  const content = await getContentItemsByFileTypeSlug(slug, page, 15, search)
  return (
    <ContentList
      title={title}
      description={description}
      items={content?.items || []}
      page={content?.page || 1}
      pageSize={content?.pageSize || 15}
      hasNextPage={content?.hasNextPage || false}
      basePath={basePath}
      search={search}
      propertyId={propertyId}
      showHeader={false}
    />
  )
}

// Match the content grid while its filtered resource query is pending.
function ContentResultsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading content" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="space-y-4 p-4">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
