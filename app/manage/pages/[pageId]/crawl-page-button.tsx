"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { Button } from "@neup/components/ui/button"
import { crawlPageAction, type CrawlPageActionState } from "../actions"
import { PageProgressIndicator, type PageProgress } from "../progress-indicator"

const initialCrawlState: CrawlPageActionState = { success: false }
const minimumStartingMs = 300

// Display the same stage ring and completion check as the insights button.
export function CrawlPageButton({ pageId, initiallyCrawling }: { pageId: string; initiallyCrawling: boolean }) {
  const [state, action, pending] = useActionState(crawlPageAction, initialCrawlState)
  const [progress, setProgress] = useState<PageProgress | null>(null)
  const startedAt = useRef<number | null>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isCrawling = initiallyCrawling || Boolean(state.alreadyCrawling)

  useEffect(() => {
    if (progressTimer.current) clearTimeout(progressTimer.current)

    if (pending) {
      startedAt.current = Date.now()
      setProgress({ label: "Starting", percent: 0 })
      progressTimer.current = setTimeout(() => {
        setProgress({ label: "Crawling", percent: 10 })
        progressTimer.current = null
      }, minimumStartingMs)
    } else if (state.success) {
      const startingTimeLeft = Math.max(0, minimumStartingMs - (Date.now() - (startedAt.current ?? Date.now())))
      progressTimer.current = setTimeout(() => {
        setProgress({ label: "Complete", percent: 100 })
        progressTimer.current = setTimeout(() => {
          setProgress(null)
          progressTimer.current = null
        }, 700)
      }, startingTimeLeft)
    } else {
      setProgress(null)
    }

    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current)
    }
  }, [pending, state.success])

  return (
    <form action={action}>
      <input type="hidden" name="pageId" value={pageId} />
      <Button
        type="submit"
        variant="outline"
        size="icon"
        disabled={pending || isCrawling}
        title={isCrawling ? "Page crawl in progress" : pending ? progress?.label || "Starting" : progress?.percent === 100 ? "Complete" : "Crawl Page"}
        aria-label={isCrawling ? "Page crawl in progress" : pending ? progress?.label || "Starting" : progress?.percent === 100 ? "Complete" : "Crawl Page"}
      >
        {isCrawling
          ? <LoaderCircle className="h-4 w-4 animate-spin" />
          : progress
            ? <PageProgressIndicator progress={progress} />
            : <RefreshCw className="h-4 w-4 transition-transform hover:rotate-180" />}
      </Button>
    </form>
  )
}
