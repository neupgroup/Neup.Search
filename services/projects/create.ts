import { prisma } from "@/lib/prisma"
import type { WorkflowStatus } from "@prisma/client"
import { getPropertyAddress, assertValidSiteDomain, normalizeSiteUrl } from "@/services/projects/domain"
import { readDetails } from "@/services/projects/view"
import type { DomainDetails } from "@/services/neupbot"

// Add the submitted location to the project's location history once.
function mergeProjectLocations(locations: string[] | undefined, nextLocation: string): string[] {
  const existing = Array.isArray(locations) ? locations.filter((location): location is string => typeof location === "string" && location.length > 0) : []
  return existing.includes(nextLocation) ? existing : [nextLocation, ...existing]
}

// Create or reuse a project record for a crawl request.
export async function upsertDomainRecord(input: { url: string; name: string; status: WorkflowStatus; details?: DomainDetails }) {
  const siteUrl = normalizeSiteUrl(input.url)
  const propertyAddress = getPropertyAddress(siteUrl)
  assertValidSiteDomain(siteUrl)
  const existing = await prisma.domain.findUnique({ where: { domain: propertyAddress }, select: { id: true, name: true, details: true, status: true } })
  const existingDetails = readDetails(existing?.details)
  const mergedDetails: DomainDetails = { ...existingDetails, ...input.details, locations: mergeProjectLocations(existingDetails.locations, siteUrl) }
  const domain = existing
    ? await prisma.domain.update({ where: { id: existing.id }, data: { name: existing.name || input.name, details: mergedDetails, ...(existing.status === "discovered" && input.status !== "discovered" ? { status: input.status } : {}) } })
    : await prisma.domain.create({ data: { id: propertyAddress, domain: propertyAddress, name: input.name, status: input.status, details: mergedDetails } })
  return { domain, siteUrl, propertyAddress }
}

// Create or find a project record and mark it ready for crawling.
export async function createDomainForCrawl(input: { url: string; description?: string }) {
  const { domain, siteUrl } = await upsertDomainRecord({ url: input.url, name: getPropertyAddress(input.url), status: "requesting", details: { description: input.description || "", currentActivity: "Queued for crawl.", pagesCrawled: 0 } })

  const shouldPromoteDiscoveredPages = await prisma.$transaction(async (transaction) => {
    const currentDomain = await transaction.domain.findUnique({
      where: { id: domain.id },
      select: { status: true, crawlLeaseUntil: true, details: true },
    })
    if (!currentDomain) throw new Error("Domain not found after creation.")
    if (["unlisted", "deleting"].includes(currentDomain.status)) throw new Error("This site is not listed for crawling.")
    if (currentDomain.status === "crawling" || (currentDomain.crawlLeaseUntil && currentDomain.crawlLeaseUntil > new Date())) return false

    await transaction.domain.update({
      where: { id: domain.id },
      data: {
        status: "requesting",
        crawlWorkerId: null,
        crawlLeaseUntil: null,
        details: {
          ...readDetails(currentDomain.details),
          currentActivity: "Queued for crawl.",
          currentCrawlUrl: "",
        },
      },
    })
    return true
  })

  if (shouldPromoteDiscoveredPages) await promoteDiscoveredPagesToCrawl(domain.id)

  return { domain, siteUrl }
}

// Promote discovered pages in batches, committing each batch independently.
export async function promoteDiscoveredPagesToCrawl(siteId: string): Promise<void> {
  while (true) {
    const promoted = await prisma.$transaction(async (transaction) => {
      const pages = await transaction.page.findMany({
        where: { domainId: siteId, status: "discovered" },
        orderBy: { discoveredOn: "asc" },
        take: 100,
        select: { id: true },
      })
      if (pages.length === 0) return 0

      const update = await transaction.page.updateMany({
        where: { domainId: siteId, status: "discovered", id: { in: pages.map((page) => page.id) } },
        data: { status: "toCrawl" },
      })
      return update.count
    })
    if (promoted === 0) break
  }

  const remaining = await prisma.page.count({ where: { domainId: siteId, status: "discovered" } })
  if (remaining === 0) {
    await prisma.domain.updateMany({ where: { id: siteId, status: "requesting" }, data: { status: "requested" } })
  }
}
