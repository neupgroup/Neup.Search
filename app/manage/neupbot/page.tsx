import { Suspense } from "react"
import { Bot } from "lucide-react"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { getLiveNeupbotWorkers, getPauseAllCrawlsStatus } from "./actions"
import { NeupbotLivePanel } from "./client"

export const dynamic = "force-dynamic"

// Load worker state after the monitor heading appears; the client loads logs separately.
async function NeupbotPanelData({ property }: { property: string }) {
  const [workers, pauseStatus] = await Promise.all([
    getLiveNeupbotWorkers(),
    getPauseAllCrawlsStatus(),
  ])

  return <NeupbotLivePanel initialWorkers={workers} initialPausePendingSites={pauseStatus.remainingSites} initialLogs={null} property={property} />
}

// Keep worker and log sections visible while initial monitor state is loading.
function NeupbotPanelSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading NeupBot monitor" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}><CardContent className="p-4"><Skeleton className="h-5 w-40" /></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</CardContent></Card>
      <Card><CardContent className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</CardContent></Card>
    </div>
  )
}

// Show the monitor shell before loading workers and logs.
export default async function ManageNeupbotPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const { property = "" } = await searchParams

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">NeupBot</h1>
        </div>
        <p className="text-sm text-muted-foreground">Live crawl monitor showing every worker and what it is doing.</p>
      </div>
      <Suspense key={property} fallback={<NeupbotPanelSkeleton />}>
        <NeupbotPanelData property={property} />
      </Suspense>
    </div>
  )
}
