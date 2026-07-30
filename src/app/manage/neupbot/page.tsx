import { Bot } from "lucide-react"
import { getLiveNeupbotCrawls } from "./actions"
import { NeupbotLivePanel } from "./client"

export const dynamic = "force-dynamic"

export default async function ManageNeupbotPage() {
  const crawls = await getLiveNeupbotCrawls()

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">NeupBot</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Live crawl monitor showing the active site and page currently being crawled.
        </p>
      </div>

      <NeupbotLivePanel initialCrawls={crawls} />
    </div>
  )
}
