import "dotenv/config"
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

const DEFAULT_PROCESS_COUNT = 4
const WORKER_SCRIPT = fileURLToPath(new URL("./worker.ts", import.meta.url))
const workers = new Map<number, ChildProcess>()
let isStopping = false

// Read the configured worker count and fall back when the value is not a positive integer.
function getWorkerProcessCount(): number {
  const configuredValue = process.env["env.process.NEUP_SEARCH_PROCESSES_COUNT"]
    ?? process.env.NEUP_SEARCH_PROCESSES_COUNT

  if (configuredValue === undefined) return DEFAULT_PROCESS_COUNT
  if (!/^[1-9]\d*$/.test(configuredValue)) return DEFAULT_PROCESS_COUNT

  const processCount = Number(configuredValue)
  return Number.isSafeInteger(processCount) ? processCount : DEFAULT_PROCESS_COUNT
}

// Start one independently supervised crawler worker process.
function startWorker(workerNumber: number): ChildProcess {
  const workerId = `neup-search-${process.pid}-${workerNumber}`
  const child = spawn(process.execPath, ["--import", "tsx", WORKER_SCRIPT, workerId], {
    stdio: "inherit",
    env: process.env,
  })

  child.on("error", (error) => {
    console.error(`[crawler-runner] Worker ${workerNumber} failed to start.`, error)
  })

  child.on("exit", (code, signal) => {
    workers.delete(workerNumber)
    if (isStopping) return

    console.warn(`[crawler-runner] Worker ${workerNumber} exited (code=${code ?? "none"}, signal=${signal ?? "none"}); restarting.`)
    setTimeout(() => startWorker(workerNumber), 1_000)
  })

  workers.set(workerNumber, child)
  return child
}

// Stop child workers when the runner receives a normal service shutdown signal.
function stopRunner(): void {
  isStopping = true
  for (const child of workers.values()) child.kill("SIGTERM")
}

// Keep the configured number of independent crawler processes alive until shutdown.
function startRunner(): void {
  const processCount = getWorkerProcessCount()
  console.info(`[crawler-runner] Starting ${processCount} crawler worker processes.`)
  for (let workerNumber = 1; workerNumber <= processCount; workerNumber++) startWorker(workerNumber)
}

process.on("SIGINT", stopRunner)
process.on("SIGTERM", stopRunner)
startRunner()
