import { ContentList } from "./content-list"
import { getContentItemsByFileTypeSlug } from "../../../../services/neupbot"

export default async function ManageContentPage() {
  const items = await getContentItemsByFileTypeSlug("content")

  return (
    <ContentList
      title="Content"
      description="All indexed media files found in crawled pages."
      items={items || []}
    />
  )
}
