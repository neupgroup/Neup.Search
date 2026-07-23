import { notFound } from "next/navigation"
import { ContentList } from "./content-list"
import {
  classifyContentSlug,
  getContentItemsByFileTypeSlug,
  type ContentKind,
} from "../../../../services/neupbot"

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

  const content = await getContentItemsByFileTypeSlug(slug, readPageParam(resolvedSearchParams.page), 15, search)
  const title = formatContentTitle(contentTarget.kind, contentTarget.fileType)
  const basePath = extension
    ? `/manage/content?extension=${encodeURIComponent(extension)}`
    : type
      ? `/manage/content?type=${encodeURIComponent(type)}`
      : "/manage/content"

  return (
    <ContentList
      title={title}
      description={
        contentTarget.fileType
          ? `Indexed ${contentTarget.fileType.toUpperCase()} files found in crawled pages.`
          : contentTarget.kind
            ? `All indexed ${contentTarget.kind} files found in crawled pages.`
            : "All indexed media files found in crawled pages."
      }
      items={content?.items || []}
      page={content?.page || 1}
      pageSize={content?.pageSize || 15}
      hasNextPage={content?.hasNextPage || false}
      basePath={basePath}
      tags={contentTags}
      search={search}
    />
  )
}
