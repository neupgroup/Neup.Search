import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

export type NeupbotLogEntry = {
  timestamp: string
  level: "INFO" | "ERROR"
  event: string
  domain: string
  pageUrl?: string
  details?: unknown
}

// Sanitize the domain before using it in a filename.
function getSafeDomainName(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown-domain"
}

// Build the daily log path using Kathmandu local calendar dates.
function getDailyLogPath(domain: string, date = new Date()): string {
  const dateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = dateParts.find((part) => part.type === "year")?.value
  const month = dateParts.find((part) => part.type === "month")?.value
  const day = dateParts.find((part) => part.type === "day")?.value
  return path.join(process.cwd(), "logs", `${year}-${month}-${day}_${getSafeDomainName(domain)}.log`)
}

// Append one structured event to the domain's daily log file.
export async function writeNeupbotLog(entry: Omit<NeupbotLogEntry, "timestamp"> & { timestamp?: string }): Promise<void> {
  const filePath = getDailyLogPath(entry.domain)
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() })}\n`, "utf8")
}

// Convert errors to readable text and save them to the domain log.
// eslint-disable-next-line no-console
export async function logError(error: unknown, context: string, domain = "unknown-domain", pageUrl?: string): Promise<void> {
  const details = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error
  try {
    await writeNeupbotLog({ level: "ERROR", event: context, domain, ...(pageUrl ? { pageUrl } : {}), details })
  } catch (loggingError) {
    // eslint-disable-next-line no-console
    console.error(`[${context}] Could not write local log.`, loggingError)
  }
}

// Read today's log entries for one domain, returning an empty list when none exist.
export async function readNeupbotLogs(domain: string): Promise<NeupbotLogEntry[]> {
  try {
    const contents = await readFile(getDailyLogPath(domain), "utf8")
    return contents.split("\n").filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line) as NeupbotLogEntry]
      } catch {
        return [{ timestamp: "", level: "ERROR" as const, event: "invalid_log_line", domain, details: line }]
      }
    }).reverse()
  } catch {
    return []
  }
}
