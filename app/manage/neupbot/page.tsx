import { Bot } from "lucide-react"
import { getLiveNeupbotWorkers } from "./actions"
import { NeupbotLivePanel } from "./client"

export const dynamic = "force-dynamic"

export default async function ManageNeupbotPage() {
  const workers = await getLiveNeupbotWorkers()

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">NeupBot</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Live crawl monitor showing every worker and what it is doing.
        </p>
      </div>

      <NeupbotLivePanel initialWorkers={workers} />
    </div>
  )
}
