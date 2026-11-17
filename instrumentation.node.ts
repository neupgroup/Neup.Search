import { spawn, type ChildProcess } from "node:child_process"
import { join } from "node:path"

type CrawlerRunnerState = {
  child?: ChildProcess
  stopping: boolean
  restartTimer?: ReturnType<typeof setTimeout>
}

const globalForCrawlerRunner = globalThis as typeof globalThis & {
  neupSearchCrawlerRunner?: CrawlerRunnerState
}

// Start and supervise the crawler process pool alongside the Node.js Next.js server.
function startCrawlerRunner(): void {
  if (globalForCrawlerRunner.neupSearchCrawlerRunner) return

  const state: CrawlerRunnerState = { stopping: false }
  globalForCrawlerRunner.neupSearchCrawlerRunner = state
  const runnerScript = join(process.cwd(), "scripts", "neupbot", "runner.ts")

  const spawnRunner = () => {
    if (state.stopping) return

    const child = spawn(process.execPath, ["--import", "tsx", runnerScript], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    })
    state.child = child
    child.on("error", (error) => {
      console.error("[crawler-supervisor] Could not start the crawler runner.", error)
    })
    child.on("exit", (code, signal) => {
      if (state.child === child) state.child = undefined
      if (state.stopping) return
      console.error(`[crawler-supervisor] Crawler runner exited (code=${code ?? "none"}, signal=${signal ?? "none"}); restarting.`)
      state.restartTimer = setTimeout(spawnRunner, 1_000)
    })
  }

  const stopRunner = () => {
    state.stopping = true
    if (state.restartTimer) clearTimeout(state.restartTimer)
    state.child?.kill("SIGTERM")
  }

  process.once("SIGINT", stopRunner)
  process.once("SIGTERM", stopRunner)
  spawnRunner()
}

startCrawlerRunner()
