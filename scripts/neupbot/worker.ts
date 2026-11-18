import { worker, type WorkerInstance } from "@neup/worker"
import { generatePageInsight } from "@/services/intelligence/page-insight"
import { generateSiteBasics } from "@/services/intelligence/site-profile-generation"
import { load } from "cheerio"

type WorkerType = "crawler" | "analysis"
type WorkerStatus = "Starting" | "Idle" | "Working" | "Stopped" | "Error"

const workerId = process.argv[2] || `neup-search-worker-${process.pid}`
const workerType = process.argv[3] === "analysis" ? "analysis" : "crawler"
const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 10_000
const apiBaseUrl = process.env.NEUP_WORKER_API_URL
const apiSecret = process.env.NEUP_WORKER_SECRET
const appBasePath = process.env.NEXT_PUBLIC_APP_BASEPATH ?? ""
let workerInstance: WorkerInstance | undefined
let activity = "Starting worker."
let activePage: { pageId: string; siteId: string; url: string } | undefined

// Build an app API URL using the configured application base path.
function getWorkerApiUrl(path: string): string {
  if (!apiBaseUrl) throw new Error("NEUP_WORKER_API_URL must be configured for the standalone worker.")
  const base = new URL(apiBaseUrl)
  const basePath = appBasePath.replace(/^\/+|\/+$/g, "")
  const apiPath = path.replace(/^\/+/, "")
  base.pathname = `${base.pathname.replace(/\/+$/, "")}${basePath ? `/${basePath}` : ""}/${apiPath}`
  return base.toString()
}

// Send an authenticated request to the application worker API.
async function callWorkerApi(path: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  if (!apiSecret) throw new Error("NEUP_WORKER_SECRET must be configured for the standalone worker.")
  const response = await fetch(getWorkerApiUrl(path), {
    method: "POST",
    headers: { authorization: `Bearer ${apiSecret}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  })
  const responseBody: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = responseBody && typeof responseBody === "object" && "error" in responseBody ? responseBody.error : null
    const description = error && typeof error === "object" && "description" in error && typeof error.description === "string"
      ? error.description
      : `Worker API request failed with HTTP ${response.status}.`
    throw new Error(description)
  }
  return responseBody
}

// Update this worker's status and current page through the API.
async function updateWorkerStatus(status: WorkerStatus, signal?: AbortSignal): Promise<void> {
  await callWorkerApi("api/worker/status", {
    workerId,
    status,
    activity,
    siteId: activePage?.siteId ?? null,
    currentUrl: activePage?.url ?? null,
    pageId: activePage?.pageId ?? null,
  }, signal)
}

// Wait between requests and allow shutdown to interrupt the delay.
function waitForNextJob(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, POLL_INTERVAL_MS)
    signal.addEventListener("abort", () => {
      clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

// Fetch and parse a claimed page without accessing the database.
async function crawlClaimedPage(page: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  if (typeof page.id !== "string" || typeof page.siteId !== "string" || typeof page.url !== "string") {
    throw new Error("The crawl job did not include a valid page context.")
  }
  activePage = { pageId: page.id, siteId: page.siteId, url: page.url }
  activity = `Crawling ${page.url}.`
  await callWorkerApi("api/worker/crawling-status", { pageId: page.id, status: "crawling", activity }, signal)
  const heartbeat = setInterval(() => {
    void updateWorkerStatus("Working").catch((error) => console.error(`[crawler-worker:${workerId}] Heartbeat failed.`, error))
  }, HEARTBEAT_INTERVAL_MS)

  try {
    const response = await fetch(page.url, {
      headers: { "User-Agent": "NeupSearchBot/1.0 (+https://neupgroup.com)" },
      redirect: "follow",
      signal,
    })
    const finalUrl = response.url || page.url
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? ""
    const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml"
    const responseText = await response.text()
    const $ = load(isHtml ? responseText : "")
    $("script, style, noscript, template, svg").remove()
    const links = isHtml
      ? $("a[href]").map((_, element) => ({
        url: $(element).attr("href") || "",
        text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 500),
        rel: $(element).attr("rel") || undefined,
      })).get()
      : []
    activity = `Saving crawl data for ${page.url}.`
    await callWorkerApi("api/worker/pages", {
      workerId,
      pageId: page.id,
      finalUrl,
      statusCode: response.status,
      isHtml,
      title: isHtml ? $("title").first().text().trim() : "",
      description: isHtml ? $("meta[name='description']").attr("content") || "" : "",
      content: isHtml ? $("body").text().replace(/\s+/g, " ").trim().slice(0, 100_000) : responseText.slice(0, 20_000),
      html: isHtml ? responseText.slice(0, 300_000) : "",
      links,
    }, signal)
    await callWorkerApi("api/worker/status", { action: "complete-if-idle", siteId: page.siteId }, signal)
  } catch (error) {
    activity = error instanceof Error ? `Crawl failed: ${error.message}` : "Crawl failed."
    await callWorkerApi("api/worker/crawling-status", { pageId: page.id, status: "crawled", activity }, signal)
    await callWorkerApi("api/worker/status", { action: "complete-if-idle", siteId: page.siteId }, signal)
    throw error
  } finally {
    clearInterval(heartbeat)
    activePage = undefined
  }
}

// Poll and execute one crawl job, then submit the extracted data through the save API.
async function processCrawlerJob(signal: AbortSignal): Promise<boolean> {
  const response = await callWorkerApi("api/worker/jobs", { workerId }, signal)
  const result = response && typeof response === "object" && "result" in response ? response.result : null
  const job = result && typeof result === "object" ? result as Record<string, unknown> : null
  if (!job || job.job === null) return false

  if (job.job === "page" && job.page && typeof job.page === "object") {
    await crawlClaimedPage(job.page as Record<string, unknown>, signal)
  }
  return true
}

// Request page context, generate its insight, then save and mark it complete through APIs.
async function processAnalysisJob(signal: AbortSignal): Promise<boolean> {
  const response = await callWorkerApi("api/worker/analysis/jobs", { workerId }, signal)
  const result = response && typeof response === "object" && "result" in response ? response.result : null
  const job = result && typeof result === "object" ? result as Record<string, unknown> : null
  const page = job?.page && typeof job.page === "object" ? job.page as Record<string, unknown> : null
  if (!page || typeof page.id !== "string" || typeof page.url !== "string" || typeof page.content !== "string") return false

  activePage = { pageId: page.id, siteId: typeof page.siteId === "string" ? page.siteId : "", url: page.url }
  activity = `Generating insight for ${page.url}.`
  const heartbeat = setInterval(() => {
    void updateWorkerStatus("Working").catch((error) => console.error(`[analysis-worker:${workerId}] Heartbeat failed.`, error))
  }, HEARTBEAT_INTERVAL_MS)
  try {
    let siteCategory = typeof page.siteCategory === "string" ? page.siteCategory : null
    const siteProfile = job?.siteProfile && typeof job.siteProfile === "object"
      ? job.siteProfile as Record<string, unknown>
      : null
    if (siteProfile && typeof siteProfile.siteId === "string" && typeof siteProfile.siteUrl === "string") {
      try {
        const basics = await generateSiteBasics({
          siteUrl: siteProfile.siteUrl,
          homepageName: typeof siteProfile.homepageName === "string" ? siteProfile.homepageName : "",
          homepageContent: typeof siteProfile.homepageContent === "string" ? siteProfile.homepageContent : "",
          renderedContent: typeof siteProfile.renderedContent === "string" ? siteProfile.renderedContent : "",
        })
        await callWorkerApi("api/worker/site-insights", { siteId: siteProfile.siteId, ...basics }, signal)
        siteCategory = basics.category
      } catch (error) {
        console.error(`[analysis-worker:${workerId}] Site profile generation failed.`, error)
      }
    }

    const insight = await generatePageInsight({
      pageUrl: page.url,
      pageTitle: typeof page.title === "string" ? page.title : "",
      pageContent: page.content,
      siteCategory,
    })
    await callWorkerApi("api/worker/insights", {
      pageId: page.id,
      workerId,
      summary: insight.summary,
      category: insight.category,
    }, signal)
    return true
  } catch (error) {
    activity = error instanceof Error ? `Insight failed: ${error.message}` : "Insight generation failed."
    await callWorkerApi("api/worker/crawling-status", {
      pageId: page.id,
      status: "analyzing",
      activity,
    }, signal)
    throw error
  } finally {
    clearInterval(heartbeat)
    activePage = undefined
  }
}

// Run the selected independent worker pool against the application APIs.
async function runWorker(signal: AbortSignal): Promise<void> {
  if (!apiBaseUrl || !apiSecret) throw new Error("Configure NEUP_WORKER_API_URL and NEUP_WORKER_SECRET before starting workers.")
  activity = `Waiting for ${workerType} work.`
  await updateWorkerStatus("Idle", signal)
  console.info(`[${workerType}-worker:${workerId}] Requesting work from the application API.`)

  while (!signal.aborted) {
    try {
      activity = workerType === "crawler" ? "Requesting a crawl job." : "Requesting an analysis job."
      const worked = workerType === "crawler"
        ? await processCrawlerJob(signal)
        : await processAnalysisJob(signal)
      activePage = undefined
      activity = worked ? "Job complete; waiting for work." : `Waiting for ${workerType} work.`
      await updateWorkerStatus("Idle", signal)
    } catch (error) {
      if (signal.aborted) break
      activity = error instanceof Error ? `API job failed: ${error.message}` : "API job failed."
      console.error(`[${workerType}-worker:${workerId}] ${activity}`)
      try {
        await updateWorkerStatus("Error", signal)
      } catch (statusError) {
        console.error(`[${workerType}-worker:${workerId}] Status update failed.`, statusError)
      }
    }
    await waitForNextJob(signal)
  }
}

// Request a clean shutdown through the shared worker lifecycle API.
function stopWorker(): void {
  workerInstance?.stop(`${workerType} worker received a shutdown signal.`)
}

process.once("SIGINT", stopWorker)
process.once("SIGTERM", stopWorker)
workerInstance = worker.new({ id: workerId, run: ({ signal }) => runWorker(signal) })
void workerInstance.done
  .catch((error: unknown) => console.error(`[${workerType}-worker:${workerId}] Worker stopped after an error.`, error))
  .finally(async () => {
    activity = "Worker stopped."
    try {
      await updateWorkerStatus("Stopped")
    } catch (error) {
      console.error(`[${workerType}-worker:${workerId}] Shutdown status update failed.`, error)
    }
  })
