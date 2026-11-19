import { Bot } from "lucide-react"
import { getLiveNeupbotWorkers, getNeupbotLogs, getPauseAllCrawlsStatus } from "./actions"
import { NeupbotLivePanel } from "./client"

export const dynamic = "force-dynamic"

export default async function ManageNeupbotPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const { property = "" } = await searchParams
  const [workers, pauseStatus, logs] = await Promise.all([
    getLiveNeupbotWorkers(),
    getPauseAllCrawlsStatus(),
    property ? getNeupbotLogs(property) : Promise.resolve([]),
  ])

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

      <NeupbotLivePanel initialWorkers={workers} initialPausePendingSites={pauseStatus.remainingSites} initialLogs={logs} property={property} />
    </div>
  )
}
