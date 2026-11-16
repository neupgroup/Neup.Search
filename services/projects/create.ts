import { prisma } from "@/lib/prisma"
import { getPropertyAddress, assertValidSiteDomain, normalizeSiteUrl } from "@/services/projects/domain"
import { readDetails } from "@/services/projects/view"
import type { DomainDetails } from "@/services/neupbot"

// Add the submitted location to the project's location history once.
function mergeProjectLocations(locations: string[] | undefined, nextLocation: string): string[] {
  const existing = Array.isArray(locations) ? locations.filter((location): location is string => typeof location === "string" && location.length > 0) : []
  return existing.includes(nextLocation) ? existing : [nextLocation, ...existing]
}

// Create or reuse a project record for a crawl request.
export async function upsertDomainRecord(input: { url: string; name: string; status: string; details?: DomainDetails }) {
  const siteUrl = normalizeSiteUrl(input.url)
  const propertyAddress = getPropertyAddress(siteUrl)
  assertValidSiteDomain(siteUrl)
  const existing = await prisma.domain.findUnique({ where: { domain: propertyAddress }, select: { id: true, name: true, details: true } })
  const existingDetails = readDetails(existing?.details)
  const mergedDetails: DomainDetails = { ...existingDetails, ...input.details, locations: mergeProjectLocations(existingDetails.locations, siteUrl) }
  const domain = existing
    ? await prisma.domain.update({ where: { id: existing.id }, data: { name: existing.name || input.name, details: mergedDetails } })
    : await prisma.domain.create({ data: { id: propertyAddress, domain: propertyAddress, name: input.name, status: input.status, details: mergedDetails } })
  return { domain, siteUrl, propertyAddress }
}

// Create or find a project record and mark it ready for crawling.
export async function createDomainForCrawl(input: { url: string; description?: string }) {
  const { domain, siteUrl } = await upsertDomainRecord({ url: input.url, name: getPropertyAddress(input.url), status: "Pending", details: { description: input.description || "", currentActivity: "Queued for crawl.", pagesCrawled: 0 } })
  return { domain, siteUrl }
}
