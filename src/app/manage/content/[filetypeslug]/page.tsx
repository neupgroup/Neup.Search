import { notFound } from "next/navigation"
import { ContentList } from "../content-list"
import {
  classifyContentSlug,
  getContentItemsByFileTypeSlug,
} from "../../../../../services/neupbot"

function formatContentTitle(kind: "image" | "video", fileType?: string) {
  if (fileType) {
    return `${fileType.toUpperCase()} ${kind === "image" ? "Images" : "Videos"}`
  }

  return kind === "image" ? "Images" : "Videos"
}

export default async function ManageContentFileTypePage({
  params,
}: {
  params: Promise<{ filetypeslug: string }>
}) {
  const { filetypeslug } = await params
  const contentTarget = classifyContentSlug(filetypeslug)

  if (!contentTarget?.kind) {
    notFound()
  }

  const items = await getContentItemsByFileTypeSlug(filetypeslug)

  if (!items) {
    notFound()
  }

  const title = formatContentTitle(contentTarget.kind, contentTarget.fileType)

  return (
    <ContentList
      title={title}
      description={
        contentTarget.fileType
          ? `Indexed ${contentTarget.fileType.toUpperCase()} files found in crawled pages.`
          : `All indexed ${contentTarget.kind} files found in crawled pages.`
      }
      items={items}
    />
  )
}
