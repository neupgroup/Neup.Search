"use client"

import { useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { Activity, Check, Pause, ScrollText } from "lucide-react"
import { Badge } from "@neup/components/ui/badge"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { Button } from "@neup/components/ui/button"
import { getLiveNeupbotWorkers, getNeupbotLogs, getPauseAllCrawlsStatus, pauseAllCrawls } from "./actions"
import type { NeupbotLogEntry } from "@/lib/logica-logging"

type WorkerActivity = Awaited<ReturnType<typeof getLiveNeupbotWorkers>>[number]

const refreshIntervalMs = 5_000
const minimumProgressStateMs = 300
const completionHoldMs = 500
const progressActivityStages = ["Starting", "Crawling Page", "Crawling Page (failed)", "Saving Content", "Saving Content (failed)", "Analyzing Page", "Analyzing Page (failed)", "Generating Insights", "Generating Insights (failed)", "Skipping", "Exiting", "Completing", "Completed flow", "Completed"]

// Render a pending-aware submit button for the global pause action.
function PauseAllCrawlsSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      <Pause className="mr-2 h-4 w-4" />
      {pending ? "Pausing all crawls..." : "Pause all crawls"}
    </Button>
  )
}

// Compare the live worker snapshot so unchanged heartbeats do not redraw the panel.
function haveWorkersChanged(previous: WorkerActivity[], next: WorkerActivity[]): boolean {
  const omitHeartbeat = (workers: WorkerActivity[]) => workers.map(({ lastSeenAt: _lastSeenAt, ...worker }) => worker)
  return JSON.stringify(omitHeartbeat(previous)) !== JSON.stringify(omitHeartbeat(next))
}

type WorkerProgress = { label: string; percent: number }

// Map the worker's persisted activity trail to its crawl or analysis progress milestone.
function getWorkerProgress(worker: WorkerActivity): WorkerProgress | null {
  const currentActivity = worker.activity.split(" → ").at(-1) || worker.activity
  if (currentActivity === "Starting") return { label: "Starting", percent: 0 }
  if (currentActivity === "Completing" || currentActivity === "Completed flow" || currentActivity === "Completed") return { label: "Completing", percent: 100 }
  if (currentActivity === "Skipping") return { label: "Skipping", percent: 90 }
  if (currentActivity === "Exiting") return { label: "Exiting", percent: 100 }
  if (currentActivity === "Analyzing Page" || currentActivity === "Generating Insights" || currentActivity.startsWith("Generating insight for ")) return { label: "Analyzing Page", percent: 80 }
  if (currentActivity.startsWith("Analyzing Page (failed)") || currentActivity.startsWith("Generating Insights (failed)") || currentActivity.startsWith("Insight failed:") || currentActivity === "Insight generation failed.") return { label: "Analyzing Page (failed)", percent: 80 }
  if (currentActivity === "Saving Content" || currentActivity.startsWith("Saving crawl data for ")) return { label: "Saving Content", percent: 55 }
  if (currentActivity === "Saving Content (failed)") return { label: "Saving Content (failed)", percent: 55 }
  if (currentActivity.startsWith("Crawling Page (failed)") || currentActivity.startsWith("Crawl failed:")) return { label: "Crawling Page (failed)", percent: 30 }
  if (currentActivity === "Crawling Page" || currentActivity.startsWith("Crawling ")) return { label: "Crawling Page", percent: 30 }
  return null
}

// Render a circular progress ring and the current crawl milestone.
function WorkerProgressIndicator({ progress }: { progress: WorkerProgress }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const [showCheckmark, setShowCheckmark] = useState(progress.label === "Completing")
  const [isBlurred, setIsBlurred] = useState(false)

  useEffect(() => {
    const shouldShowCheckmark = progress.label === "Completing"
    if (showCheckmark === shouldShowCheckmark) return

    setIsBlurred(true)
    const transitionTimer = window.setTimeout(() => {
      setShowCheckmark(shouldShowCheckmark)
      window.requestAnimationFrame(() => setIsBlurred(false))
    }, 180)

    return () => window.clearTimeout(transitionTimer)
  }, [progress.label, showCheckmark])

  const iconTransitionClass = `transition-all duration-200 ease-out ${isBlurred ? "scale-75 blur-sm opacity-0" : "scale-100 blur-0 opacity-100"}`

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {showCheckmark ? (
        <Check className={`h-7 w-7 shrink-0 text-primary ${iconTransitionClass}`} role="img" aria-label="Complete" />
      ) : (
        <svg className={`h-7 w-7 shrink-0 -rotate-90 ${iconTransitionClass}`} viewBox="0 0 40 40" role="img" aria-label="In progress">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress.percent / 100)}
            className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
      )}
      <p className="text-sm font-medium">{progress.label}</p>
    </div>
  )
}

// Hold the finished URL briefly when a worker moves directly to its next page.
function NeupbotWorkerCard({ worker }: { worker: WorkerActivity }) {
  const [displayWorker, setDisplayWorker] = useState(worker)
  const latestWorker = useRef(worker)
  const previousWorker = useRef(worker)
  const lastSeenActivity = useRef(worker.activity)
  const activityQueue = useRef<Array<{ worker: WorkerActivity; activity: string; currentUrl: string | null }>>([])
  const displayedWorker = useRef(displayWorker)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  latestWorker.current = worker
  displayedWorker.current = displayWorker

  useEffect(() => {
    const previous = previousWorker.current
    previousWorker.current = worker
    const previousActivity = previous.activity.split(" → ").at(-1) || ""
    const nextStages = worker.activity.split(" → ")
    const latestActivity = nextStages.at(-1) || worker.activity
    const failureBeforeExit = latestActivity === "Exiting" ? nextStages.slice(0, -1).at(-1) : null

    if ((failureBeforeExit?.endsWith("(failed)") || failureBeforeExit === "Skipping") && previous.activity !== worker.activity) {
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
      activityQueue.current = []
      lastSeenActivity.current = worker.activity
      const failureSnapshot = {
        ...worker,
        activity: nextStages.slice(0, -1).join(" → "),
        currentUrl: worker.currentUrl || previous.currentUrl || displayedWorker.current.currentUrl,
      }
      setDisplayWorker(failureSnapshot)
      transitionTimer.current = setTimeout(() => {
        setDisplayWorker({ ...latestWorker.current, currentUrl: latestWorker.current.currentUrl || failureSnapshot.currentUrl })
        transitionTimer.current = null
      }, minimumProgressStateMs)
      return
    }
    const movedToNextPage = previous.status === "Working"
      && worker.status === "Working"
      && Boolean(previous.currentUrl && worker.currentUrl && previous.currentUrl !== worker.currentUrl)
    const startedAfterCompletion = (previousActivity === "Completing" || previousActivity === "Exiting" || previousActivity === "Completed flow" || previousActivity === "Completed")
      && worker.status === "Working"
      && Boolean(worker.currentUrl)

    if (movedToNextPage || startedAfterCompletion) {
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
      lastSeenActivity.current = worker.activity
      activityQueue.current = []
      setDisplayWorker(displayedWorker.current.currentUrl ? displayedWorker.current : previous)
      transitionTimer.current = setTimeout(() => {
        const nextWorker = latestWorker.current
        setDisplayWorker({ ...nextWorker, activity: "Starting" })
        transitionTimer.current = setTimeout(() => {
          setDisplayWorker(latestWorker.current)
          transitionTimer.current = null
        }, minimumProgressStateMs)
      }, completionHoldMs)
      return
    }

    const previousStages = lastSeenActivity.current.split(" → ")
    const hasPreviousTrail = previousStages.length <= nextStages.length
      && previousStages.every((stage, index) => nextStages[index] === stage)
    const appendedStages = hasPreviousTrail ? nextStages.slice(previousStages.length) : []
    lastSeenActivity.current = worker.activity
    for (const activity of appendedStages) {
      if (!progressActivityStages.includes(activity)) continue
      const trailIndex = nextStages.indexOf(activity, previousStages.length)
      activityQueue.current.push({
        worker,
        activity: nextStages.slice(0, trailIndex + 1).join(" → "),
        currentUrl: worker.currentUrl || previous.currentUrl || displayedWorker.current.currentUrl,
      })
    }

    if (!transitionTimer.current && activityQueue.current.length > 0) {
      const playNextStage = () => {
        const nextStage = activityQueue.current.shift()
        if (nextStage) {
          setDisplayWorker({ ...nextStage.worker, activity: nextStage.activity, currentUrl: nextStage.currentUrl })
          transitionTimer.current = setTimeout(playNextStage, minimumProgressStateMs)
          return
        }

        const latest = latestWorker.current
        const terminal = ["Completing", "Exiting", "Completed flow", "Completed"].includes(latest.activity.split(" → ").at(-1) || "")
        setDisplayWorker({
          ...latest,
          currentUrl: latest.currentUrl || (terminal ? previous.currentUrl || displayedWorker.current.currentUrl : null),
        })
        transitionTimer.current = null
      }
      playNextStage()
    } else if (!transitionTimer.current && appendedStages.length === 0) {
      const isTerminal = latestActivity === "Completing" || latestActivity === "Exiting" || latestActivity === "Completed flow" || latestActivity === "Completed"
      setDisplayWorker({ ...worker, currentUrl: worker.currentUrl || (isTerminal ? previous.currentUrl || displayedWorker.current.currentUrl : null) })
    }
  }, [worker])

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  const terminalStage = displayWorker.activity.split(" → ").at(-1) || ""
  const progress = getWorkerProgress(displayWorker)
  const showProgress = Boolean(displayWorker.currentUrl) && progress !== null && (displayWorker.status === "Working" || progressActivityStages.includes(terminalStage))

  return (
    <Card>
      <CardContent className="flex min-h-14 items-center justify-between gap-4 px-3 py-2">
        {showProgress && (
          <>
            <WorkerProgressIndicator progress={progress} />
            {displayWorker.currentUrl && (
              <Link
                href={displayWorker.pageId && displayWorker.siteId
                  ? `/manage/pages/${displayWorker.pageId}?property=${encodeURIComponent(displayWorker.siteId)}`
                  : "/manage/discovery/pages"}
                title={displayWorker.currentUrl}
                className="min-w-0 truncate text-right text-sm text-muted-foreground hover:underline"
              >
                {displayWorker.currentUrl}
              </Link>
            )}
          </>
        )}
        {!showProgress && (
          <>
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {displayWorker.status === "Idle" && displayWorker.activity.includes("Failed")
                ? `Last job: ${displayWorker.activity}`
                : displayWorker.activity}
            </p>
            <Badge variant="outline">{displayWorker.status}</Badge>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function NeupbotLivePanel({
  initialWorkers,
  initialPausePendingSites,
  initialLogs,
  property,
}: {
  initialWorkers: WorkerActivity[]
  initialPausePendingSites: number | null
  initialLogs: NeupbotLogEntry[] | null
  property: string
}) {
  const [workers, setWorkers] = useState(initialWorkers)
  const [pausePendingSites, setPausePendingSites] = useState(initialPausePendingSites)
  const [logs, setLogs] = useState<NeupbotLogEntry[] | null>(initialLogs)
  const activeJobs = workers.filter((worker) => worker.status === "Working" && worker.siteId && worker.currentUrl)
  const activeAnalyses = activeJobs.filter((worker) => getWorkerProgress(worker)?.label.startsWith("Analyzing Page"))
  const activeCrawls = activeJobs.length - activeAnalyses.length

  // Pause all currently eligible sites and keep the control visible if any remain.
  const submitPauseAllCrawls = async (_formData: FormData) => {
    const result = await pauseAllCrawls()
    setPausePendingSites(result.remainingSites)
  }

  useEffect(() => {
    let isMounted = true
    let isRefreshing = false

    const refreshCrawls = async () => {
      if (isRefreshing) return
      isRefreshing = true

      try {
        const [nextWorkers, pauseStatus] = await Promise.all([
          getLiveNeupbotWorkers(),
          getPauseAllCrawlsStatus(),
        ])
        if (isMounted) {
          setWorkers((currentWorkers) => haveWorkersChanged(currentWorkers, nextWorkers) ? nextWorkers : currentWorkers)
          setPausePendingSites(pauseStatus.remainingSites)
        }
      } catch {
        // Keep the last worker snapshot visible when a refresh request fails.
      } finally {
        isRefreshing = false
      }
    }

    const refreshLogs = async () => {
      if (!property) return
      try {
        const nextLogs = await getNeupbotLogs(property)
        if (isMounted) setLogs(nextLogs)
      } catch {
        if (isMounted) setLogs([])
      }
    }

    refreshCrawls()
    refreshLogs()
    const interval = window.setInterval(refreshCrawls, refreshIntervalMs)
    const logInterval = window.setInterval(refreshLogs, refreshIntervalMs)

    return () => {
      isMounted = false
      window.clearInterval(interval)
      window.clearInterval(logInterval)
    }
  }, [property])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>{workers.length.toLocaleString()} live workers · {activeCrawls.toLocaleString()} active crawls · {activeAnalyses.length.toLocaleString()} active analyses</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">Updates when worker activity changes</Badge>
          {pausePendingSites !== 0 && (
            <form action={submitPauseAllCrawls}>
              <PauseAllCrawlsSubmitButton />
            </form>
          )}
        </div>
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
          <div className="space-y-2">
            {workers.map((worker) => (
              <NeupbotWorkerCard key={worker.id} worker={worker} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          <h2 className="text-lg font-semibold">Today&apos;s logs{property ? ` · ${property}` : ""}</h2>
        </div>
        {!property ? (
          <Card className="border-dashed"><CardContent className="p-5 text-sm text-muted-foreground">Select a property to view its logs.</CardContent></Card>
        ) : logs === null ? (
          <Card><CardContent className="space-y-3 p-3" aria-label="Loading logs" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </CardContent></Card>
        ) : logs.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-5 text-sm text-muted-foreground">No logs have been written for this property today.</CardContent></Card>
        ) : (
          <Card><CardContent className="max-h-[32rem] space-y-2 overflow-auto p-3">
            {logs.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className="border-b pb-2 last:border-0">
                <p className="text-sm"><span className={entry.level === "ERROR" ? "font-semibold text-destructive" : "font-semibold"}>{entry.level}</span> · {entry.event} · {new Date(entry.timestamp).toLocaleTimeString()}</p>
                {entry.pageUrl && <p className="truncate text-xs text-muted-foreground">{entry.pageUrl}</p>}
                {entry.details !== undefined && <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2)}</pre>}
              </div>
            ))}
          </CardContent></Card>
        )}
      </section>

    </div>
  )
}
