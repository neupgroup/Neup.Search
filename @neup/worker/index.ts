import { randomUUID } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"

/** Context supplied to an in-process worker task. */
export type WorkerContext = {
  id: string
  signal: AbortSignal
}

/** Start a task in this process or launch a script in its own Node.js process. */
export type WorkerOptions = {
  id?: string
  run?: (context: WorkerContext) => void | Promise<void>
  script?: string
  args?: string[]
  watch?: boolean
}

/** Worker status and lifecycle controls. */
export type WorkerInstance = {
  id: string
  process: number | ChildProcess
  status: "running" | "stopping" | "stopped" | "failed"
  done: Promise<void>
  stop: (reason?: string) => void
}

/** Create one worker task or launch one worker script process. */
function createWorker(options: WorkerOptions): WorkerInstance {
  if (Boolean(options.run) === Boolean(options.script)) {
    throw new Error("Provide exactly one of run or script to create a worker.")
  }

  const id = options.id ?? randomUUID()
  const controller = new AbortController()
  let status: WorkerInstance["status"] = "running"
  let child: ChildProcess | undefined

  const done = options.script
    ? new Promise<void>((resolve, reject) => {
      const watchArgs = options.watch ? ["--watch"] : []
      child = spawn(process.execPath, [...watchArgs, "--import", "tsx", options.script!, id, ...(options.args ?? [])], {
        stdio: "inherit",
        env: process.env,
      })
      child.once("error", (error) => {
        status = "failed"
        reject(error)
      })
      child.once("exit", (code, signal) => {
        if (status === "stopping" || code === 0) {
          status = "stopped"
          resolve()
          return
        }
        status = "failed"
        reject(new Error(`Worker process ${id} exited (code=${code ?? "none"}, signal=${signal ?? "none"}).`))
      })
    })
    : Promise.resolve()
      .then(() => options.run!({ id, signal: controller.signal }))
      .then(() => {
        status = "stopped"
      })
      .catch((error: unknown) => {
        status = "failed"
        throw error
      })

  return {
    id,
    get process() {
      return child ?? process.pid
    },
    get status() {
      return status
    },
    done,
    stop(reason = "Worker stop requested.") {
      if (status !== "running") return
      status = "stopping"
      controller.abort(reason)
      child?.kill("SIGTERM")
    },
  }
}

/** Standard worker package entry point. */
export const worker = { new: createWorker }

export { createWorker as create }
export default worker
