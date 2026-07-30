"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getLiveNeupbotCrawls } from "./actions"

type CrawlActivity = Awaited<ReturnType<typeof getLiveNeupbotCrawls>>[number]

const refreshIntervalMs = 500

function CrawlCard({ crawl }: { crawl: CrawlActivity }) {
  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{crawl.status}</Badge>
              <Link href={`/manage/sites/${crawl.siteId}`} className="font-semibold hover:underline">
                {crawl.siteName || crawl.siteUrl}
              </Link>
            </div>
            <Link
              href={crawl.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 break-all text-sm text-muted-foreground hover:text-primary"
            >
              <span>{crawl.siteUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </Link>
            <div className="text-sm text-muted-foreground">
              {crawl.currentActivity || "Crawler is active."}
            </div>
            {crawl.currentCrawlUrl && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Crawling page</div>
                <div className="mt-1 break-all text-muted-foreground">{crawl.currentCrawlUrl}</div>
              </div>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-3 text-sm lg:min-w-[360px]">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Crawled</div>
              <div className="mt-1 text-lg font-semibold">{crawl.pagesCrawled.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Internal</div>
              <div className="mt-1 text-lg font-semibold">{crawl.internalResourcesFound.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">External</div>
              <div className="mt-1 text-lg font-semibold">{crawl.externalResourcesFound.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function NeupbotLivePanel({ initialCrawls }: { initialCrawls: CrawlActivity[] }) {
  const [crawls, setCrawls] = useState(initialCrawls)

  useEffect(() => {
    let isMounted = true
    let isRefreshing = false

    const refreshCrawls = async () => {
      if (isRefreshing) return
      isRefreshing = true

      try {
        const nextCrawls = await getLiveNeupbotCrawls()
        if (isMounted) setCrawls(nextCrawls)
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
          <span>{crawls.length.toLocaleString()} active crawls</span>
        </div>
        <Badge variant="outline">Updates every {refreshIntervalMs / 1000} second</Badge>
      </div>

      {crawls.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            NeupBot is not crawling any site right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {crawls.map((crawl) => (
            <CrawlCard key={crawl.siteId} crawl={crawl} />
          ))}
        </div>
      )}
    </div>
  )
}
