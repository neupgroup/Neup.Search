import "dotenv/config"
import { fileURLToPath } from "node:url"
import { worker, type WorkerInstance } from "@neup/worker"

const DEFAULT_WORKER_COUNT = 1
const MAX_WORKERS_PER_TYPE = 32
const WORKER_SCRIPT = fileURLToPath(new URL("./worker.ts", import.meta.url))
const workers = new Map<string, WorkerInstance>()
let isStopping = false

// Read a configured worker count and constrain it to a safe positive integer.
function getWorkerCount(environmentKey: string): number {
  const configuredValue = process.env[environmentKey]
  if (configuredValue === undefined) return DEFAULT_WORKER_COUNT
  if (!/^[1-9]\d*$/.test(configuredValue)) return DEFAULT_WORKER_COUNT
  const count = Number(configuredValue)
  return Number.isSafeInteger(count) ? Math.min(count, MAX_WORKERS_PER_TYPE) : DEFAULT_WORKER_COUNT
}

// Start and supervise one crawler or analysis worker process.
function startWorker(type: "crawler" | "analysis", workerNumber: number): WorkerInstance {
  const workerId = `neup-search-${type}-${process.pid}-${workerNumber}`
  const instance = worker.new({
    id: workerId,
    script: WORKER_SCRIPT,
    args: [type],
    watch: process.env.NODE_ENV === "development",
  })
  workers.set(workerId, instance)

  const handleExit = (error?: unknown) => {
    workers.delete(workerId)
    if (isStopping) return
    console.warn(`[worker-runner] ${type} worker ${workerNumber} exited and will restart.`, error ?? "Process stopped unexpectedly.")
    setTimeout(() => startWorker(type, workerNumber), 1_000)
  }
  void instance.done.then(() => handleExit(), (error: unknown) => handleExit(error))
  return instance
}

// Stop all worker processes after the runner receives a shutdown signal.
function stopRunner(): void {
  isStopping = true
  for (const instance of workers.values()) instance.stop("Worker runner shutting down.")
  const shutdownTimeout = setTimeout(() => {
    for (const instance of workers.values()) {
      if (typeof instance.process !== "number") instance.process.kill("SIGKILL")
    }
  }, 10_000)
  shutdownTimeout.unref()

  const waitForWorkers = () => {
    if (workers.size === 0) {
      clearTimeout(shutdownTimeout)
      process.exit(0)
      return
    }
    setTimeout(waitForWorkers, 100).unref()
  }
  waitForWorkers()
}

// Start the configured crawler and insight worker pools.
function startRunner(): void {
  const crawlerCount = getWorkerCount("NEUP_WORKER_CRAWLER_WORKERS")
  const analysisCount = getWorkerCount("NEUP_WORKER_ANALYSIS_WORKERS")
  console.info(`[worker-runner] Starting ${crawlerCount} crawler and ${analysisCount} analysis worker processes.`)
  for (let workerNumber = 1; workerNumber <= crawlerCount; workerNumber++) startWorker("crawler", workerNumber)
  for (let workerNumber = 1; workerNumber <= analysisCount; workerNumber++) startWorker("analysis", workerNumber)
}

process.on("SIGINT", stopRunner)
process.on("SIGTERM", stopRunner)
startRunner()
