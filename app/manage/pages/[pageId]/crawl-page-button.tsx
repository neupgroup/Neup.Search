"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { crawlPageAction, type CrawlPageActionState } from "../actions"
import { PageProgressIndicator, type PageProgress } from "../progress-indicator"

const initialCrawlState: CrawlPageActionState = { success: false }
const minimumStartingMs = 300

// Render the crawl action as a full-card submit button.
export function CrawlPageButton({ pageId, initiallyCrawling, isPaused = false }: { pageId: string; initiallyCrawling: boolean; isPaused?: boolean }) {
  const [state, action, pending] = useActionState(crawlPageAction, initialCrawlState)
  const [progress, setProgress] = useState<PageProgress | null>(null)
  const startedAt = useRef<number | null>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isCrawling = initiallyCrawling || Boolean(state.alreadyCrawling)
  const isDisabled = pending || isCrawling || isPaused
  const actionDescription = isPaused
    ? "Crawling is paused for this site"
    : isCrawling
      ? "A crawl is already in progress"
      : pending
        ? progress?.label || "Starting crawl"
        : progress?.percent === 100
          ? "Crawl complete"
          : "Run a fresh snapshot"

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
      <button
        type="submit"
        disabled={isDisabled}
        title={actionDescription}
        aria-label={`Crawl page. ${actionDescription}`}
        className="group flex min-h-20 w-full items-start justify-between gap-2 rounded-xl border border-border/70 bg-card/80 p-3 text-left shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <RefreshCw className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
          </span>
          <span className="min-w-0 space-y-1">
            <span className="block truncate text-sm font-semibold text-muted-foreground">Crawl page</span>
            <span className="block truncate text-sm font-semibold">{actionDescription}</span>
          </span>
        </span>
        <span className="shrink-0 pt-1">
          {isCrawling
            ? <LoaderCircle className="h-4 w-4 animate-spin" />
            : progress
              ? <PageProgressIndicator progress={progress} />
              : null}
        </span>
      </button>
    </form>
  )
}
