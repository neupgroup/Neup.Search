"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity } from "lucide-react"
import { Badge } from "@neup/components/ui/badge"
import { Card, CardContent } from "@neup/components/ui/card"
import { getLiveNeupbotWorkers } from "./actions"

type WorkerActivity = Awaited<ReturnType<typeof getLiveNeupbotWorkers>>[number]

const refreshIntervalMs = 1_000

function buildProfileHref(siteId: string, propertyId?: string) {
  if (!propertyId) return `/manage/property/${siteId}`
  return `/manage/property/${siteId}?property=${encodeURIComponent(propertyId)}`
}

export function NeupbotLivePanel({
  initialWorkers,
  propertyId,
}: {
  initialWorkers: WorkerActivity[]
  propertyId?: string
}) {
  const [workers, setWorkers] = useState(initialWorkers)
  const activeCrawls = workers.filter((worker) => worker.status === "Working" && worker.siteId && worker.currentUrl)

  useEffect(() => {
    let isMounted = true
    let isRefreshing = false

    const refreshCrawls = async () => {
      if (isRefreshing) return
      isRefreshing = true

      try {
        const nextWorkers = await getLiveNeupbotWorkers()
        if (isMounted) setWorkers(nextWorkers)
      } finally {
        isRefreshing = false
      }
    }

    refreshCrawls()
    const interval = window.setInterval(refreshCrawls, refreshIntervalMs)

    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>{workers.length.toLocaleString()} live workers · {activeCrawls.length.toLocaleString()} active crawls</span>
        </div>
        <Badge variant="outline">Updates every {refreshIntervalMs / 1000} second</Badge>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Workers</h2>
        {workers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-5 text-center text-sm text-muted-foreground">
              No live workers are reporting.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workers.map((worker, index) => (
              <Card key={worker.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Worker {worker.id.split("-").at(-1) || index + 1}</span>
                    <Badge variant={worker.status === "Working" ? "default" : "outline"}>{worker.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {worker.status === "Idle" && (worker.activity.includes("Completed") || worker.activity.includes("Failed"))
                      ? `Last job: ${worker.activity}`
                      : worker.activity}
                  </p>
                  {worker.siteUrl && (
                    <Link href={worker.siteId ? buildProfileHref(worker.siteId, propertyId) : worker.siteUrl} className="block truncate text-sm hover:underline">
                      {worker.siteUrl}
                    </Link>
                  )}
                  {worker.currentUrl && (
                    <p className="break-all text-xs text-muted-foreground">{worker.currentUrl}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <h2 className="pt-2 text-lg font-semibold">Active page crawls</h2>
      {activeCrawls.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            NeupBot is not crawling any site right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeCrawls.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Worker {worker.id.split("-").at(-1)} is crawling</div>
                  <p className="break-all text-sm text-muted-foreground">{worker.currentUrl}</p>
                </div>
                {worker.siteId && (
                  <Link href={buildProfileHref(worker.siteId, propertyId)} className="shrink-0 text-sm hover:underline">
                    {worker.siteUrl}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
