import * as cheerio from "cheerio"
import { prisma } from "@/lib/prisma"
import { neupbotUserAgent } from "@/services/neupbot"
import { readDetails } from "@/services/projects/view"
import { getBasics } from "@/services/intelligence/site-profile"
import type { DomainDetails } from "@/services/neupbot"

// Update selected project metadata while retaining existing details.
export async function updateDomainDetails(domainId: string, details: DomainDetails) {
  const existing = await prisma.domain.findUnique({ where: { id: domainId }, select: { details: true } })
  await prisma.domain.update({ where: { id: domainId }, data: { details: { ...readDetails(existing?.details), ...details } } })
}

// Follow homepage redirects only while the destination remains on the same hostname.
async function fetchHomepageWithinDomain(homepageUrl: URL, requestedSiteUrl: string): Promise<Response> {
  const allowedHostname = new URL(requestedSiteUrl).hostname.toLowerCase()
  let currentUrl = homepageUrl

  for (let redirectCount = 0; redirectCount <= 10; redirectCount++) {
    if (currentUrl.hostname.toLowerCase() !== allowedHostname) {
      throw new Error("Homepage redirect leaves the site's domain.")
    }
    const response = await fetch(currentUrl, {
      headers: { "User-Agent": neupbotUserAgent },
      cache: "no-store",
      redirect: "manual",
    })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get("location")
    if (!location) throw new Error("Homepage redirect did not provide a destination.")
    currentUrl = new URL(location, currentUrl)
  }

  throw new Error("Homepage exceeded the redirect limit.")
}

// Fetch the homepage and use Logica Intelligence to generate and save site basics.
export async function summarizeDomain(siteId: string, siteUrl: string) {
  await updateDomainDetails(siteId, { currentActivity: "Summarizing domain..." })
  const homepageUrl = new URL(siteUrl)
  homepageUrl.pathname = "/"
  homepageUrl.search = ""
  homepageUrl.hash = ""
  const response = await fetchHomepageWithinDomain(homepageUrl, siteUrl)
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
  if (!response.ok || (contentType !== "text/html" && contentType !== "application/xhtml+xml")) throw new Error("Could not fetch an HTML page to summarize.")
  const html = await response.text()
  const $ = cheerio.load(html)
  const basics = await getBasics({
    siteId,
    siteUrl: response.url || homepageUrl.toString(),
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
