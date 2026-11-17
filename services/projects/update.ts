import * as cheerio from "cheerio"
import { prisma } from "@/lib/prisma"
import { neupbotUserAgent } from "@/services/neupbot"
import { readDetails } from "@/services/projects/view"
import { getBasics } from "@/services/intelligence/basics"
import type { DomainDetails } from "@/services/neupbot"

// Update selected project metadata while retaining existing details.
export async function updateDomainDetails(domainId: string, details: DomainDetails) {
  const existing = await prisma.domain.findUnique({ where: { id: domainId }, select: { details: true } })
  await prisma.domain.update({ where: { id: domainId }, data: { details: { ...readDetails(existing?.details), ...details } } })
}

// Fetch the homepage and use Logica Intelligence to generate and save site basics.
export async function summarizeDomain(siteId: string, siteUrl: string) {
  await updateDomainDetails(siteId, { currentActivity: "Summarizing domain..." })
  const homepageUrl = new URL(siteUrl)
  homepageUrl.pathname = "/"
  homepageUrl.search = ""
  homepageUrl.hash = ""
  const response = await fetch(homepageUrl, { headers: { "User-Agent": neupbotUserAgent }, cache: "no-store" })
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
  if (!response.ok || (contentType !== "text/html" && contentType !== "application/xhtml+xml")) throw new Error("Could not fetch an HTML page to summarize.")
  const html = await response.text()
  const $ = cheerio.load(html)
  const basics = await getBasics({
    siteId,
    siteUrl: homepageUrl.toString(),
    homepageName: $("title").text().trim(),
    homepageContent: $("body").text().replace(/\s+/g, " ").trim().slice(0, 12_000),
    renderedContent: html,
  })
  if (!basics) throw new Error("Logica Intelligence could not generate site basics.")
  await updateDomainDetails(siteId, { currentActivity: "" })
}

// Keep crawl status and existing project details when an auxiliary summary update fails.
export async function markDomainSummaryFailed(siteId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await updateDomainDetails(siteId, { currentActivity: `Site summary failed: ${message}` })
}
