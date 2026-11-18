import { prisma } from "@/lib/prisma"
import { getFavicon } from "@/services/properties/getFavicon"
import { neupbotUserAgent } from "@/services/neupbot"
import { classifyContentUrl, readContentAssets, readRedirectTarget } from "@/services/neupbot"
import type { ContentItem, ManagedDomain, PropertyDashboard, DomainDetails, ManagedPage, CrawlIssue } from "@/services/neupbot"

// Convert persisted JSON details into the project details shape.
export function readDetails(details: unknown): DomainDetails {
  return details && typeof details === "object" && !Array.isArray(details) ? details as DomainDetails : {}
}

// Keep page result labels stable while the database status tracks flow progress.
function readPageResultStatus(status: string, details: unknown): string {
  if (details && typeof details === "object" && !Array.isArray(details) && "crawlResultStatus" in details) {
    const resultStatus = details.crawlResultStatus
    if (typeof resultStatus === "string") return resultStatus
  }
  return status
}

// Format a domain record for project views.
export function mapDomainToSite(domain: {
  id: string; domain: string; name: string; status: string; lastCrawled: Date | null; addedOn: Date; details: unknown; categories?: string | null; _count?: { pages: number }
}): ManagedDomain {
  const details = readDetails(domain.details)
  const primaryLocation = Array.isArray(details.locations) ? details.locations[0] : undefined
  return {
    id: domain.id,
    url: primaryLocation || `https://${domain.domain}`,
    description: details.description || "",
    status: domain.status as ManagedDomain["status"],
    lastCrawled: domain.lastCrawled ? domain.lastCrawled.toLocaleDateString() : "Never",
    createdAt: domain.addedOn,
    pagesCrawled: details.pagesCrawled ?? domain._count?.pages ?? 0,
    internalResourcesFound: details.internalResourcesFound ?? 0,
    externalResourcesFound: details.externalResourcesFound ?? 0,
    currentlyCrawling: details.currentActivity,
    currentCrawlUrl: details.currentCrawlUrl,
    name: domain.name || undefined,
    logoUrl: details.logoUrl,
    appIconUrl: details.appIconUrl,
    appIconBackgroundColor: details.appIconBackgroundColor,
    summary: details.summary,
    categories: domain.categories ?? null,
  }
}

// Enrich a project with its current favicon branding.
export async function enrichManagedDomainBranding(site: ManagedDomain): Promise<ManagedDomain> {
  const branding = await getFavicon(site.id, { currentBackgroundColor: site.appIconBackgroundColor, userAgent: neupbotUserAgent })
  return { ...site, appIconUrl: branding.appIconUrl, appIconBackgroundColor: branding.appIconBackgroundColor }
}

// Load one managed project by its database ID using only persisted branding.
export async function getManagedDomainById(siteId: string): Promise<ManagedDomain | null> {
  const domain = await prisma.domain.findUnique({ where: { id: siteId }, include: { _count: { select: { pages: true } } } })
  return domain ? mapDomainToSite(domain) : null
}

// Load only crawl status fields so status polling does not fetch page counts or remote branding.
export async function getManagedDomainCrawlStatus(siteId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: siteId },
    select: { id: true, domain: true, name: true, status: true, lastCrawled: true, addedOn: true, details: true },
  })
  if (!domain) return null

  const site = mapDomainToSite(domain)
  return {
    status: site.status,
    lastCrawled: site.lastCrawled,
    pagesCrawled: site.pagesCrawled ?? 0,
    internalResourcesFound: site.internalResourcesFound ?? 0,
    externalResourcesFound: site.externalResourcesFound ?? 0,
    currentlyCrawling: site.currentlyCrawling,
    currentCrawlUrl: site.currentCrawlUrl,
    createdAt: site.createdAt.toISOString(),
  }
}

// Load the project dashboard and its recent crawl, link, and content summaries.
export async function getPropertyDashboard(propertyId: string): Promise<PropertyDashboard | null> {
  const domain = await prisma.domain.findUnique({ where: { id: propertyId }, include: { _count: { select: { pages: true } } } })
  if (!domain) return null
  const property = mapDomainToSite(domain)
  const [totalPages, indexedPagesCount, linksCount, crawlErrorsCount, recentPageRows, indexedPageRows, crawlErrorRows, linkRows, contentPageRows, contentResourceRows] = await Promise.all([
    prisma.page.count({ where: { domainId: propertyId } }),
    prisma.page.count({ where: { domainId: propertyId, status: { in: ["analyzed", "indexed"] } } }),
    prisma.resource.count({ where: { fromDomain: propertyId, type: "link" } }),
    prisma.page.count({ where: { domainId: propertyId, OR: [{ statusCode: { gte: 300 } }, { details: { path: ["crawlResultStatus"], equals: "Error" } }, { details: { path: ["crawlResultStatus"], equals: "Skipped" } }, { details: { path: ["crawlResultStatus"], equals: "Redirect" } }] } }),
    prisma.page.findMany({ where: { domainId: propertyId }, orderBy: [{ lastCrawled: "desc" }, { discoveredOn: "desc" }], take: 8, include: { domain: { select: { domain: true, name: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId, status: { in: ["analyzed", "indexed"] } }, orderBy: [{ lastCrawled: "desc" }, { discoveredOn: "desc" }], take: 8, include: { domain: { select: { domain: true, name: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId, OR: [{ statusCode: { gte: 300 } }, { details: { path: ["crawlResultStatus"], equals: "Error" } }, { details: { path: ["crawlResultStatus"], equals: "Skipped" } }, { details: { path: ["crawlResultStatus"], equals: "Redirect" } }] }, orderBy: [{ lastCrawled: "desc" }, { discoveredOn: "desc" }], take: 8, include: { domain: { select: { domain: true } } } }),
    prisma.resource.findMany({ where: { fromDomain: propertyId, type: "link" }, orderBy: { firstCrawlOn: "desc" }, take: 10, include: { from: { select: { domain: true } }, to: { select: { domain: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId }, orderBy: [{ lastCrawled: "desc" }, { discoveredOn: "desc" }], take: 200, select: { id: true, url: true, title: true, type: true, details: true, category: true, status: true, statusCode: true, domain: { select: { domain: true } } } }),
    prisma.resource.findMany({ where: { fromDomain: propertyId, type: { in: ["image", "video", "audio", "iframe"] } } }),
  ])
  const contentItems: ContentItem[] = []
  const seenContentUrls = new Set<string>()
  const contentResourcesByPage = new Map<string, typeof contentResourceRows>()
  for (const resource of contentResourceRows) {
    if (!resource.sourcePageId) continue
    const resources = contentResourcesByPage.get(resource.sourcePageId) ?? []
    resources.push(resource)
    contentResourcesByPage.set(resource.sourcePageId, resources)
  }
  for (const page of contentPageRows) {
    if (contentItems.length >= 12) break
    const sourcePageTitle = page.title || page.url
    const directContent = classifyContentUrl(page.url)
    if (directContent && !seenContentUrls.has(page.url)) {
      seenContentUrls.add(page.url)
      contentItems.push({ id: `${page.id}:direct`, url: page.url, kind: directContent.kind, fileType: directContent.fileType, sourcePageId: page.id, sourcePageUrl: page.url, sourcePageTitle, siteUrl: page.domain.domain, status: readPageResultStatus(page.status, page.details), statusCode: page.statusCode })
    }
    if (contentItems.length >= 12) break
    const resources = contentResourcesByPage.get(page.id) ?? []
    for (const asset of readContentAssets(resources, page.url)) {
      if (contentItems.length >= 12) break
      const content = asset.kind && asset.fileType ? { kind: asset.kind, fileType: asset.fileType } : classifyContentUrl(asset.url)
      if (!content || seenContentUrls.has(asset.url)) continue
      seenContentUrls.add(asset.url)
      contentItems.push({ id: `${page.id}:${asset.url}`, url: asset.url, kind: content.kind, fileType: content.fileType, sourcePageId: page.id, sourcePageUrl: page.url, sourcePageTitle, siteUrl: page.domain.domain, status: readPageResultStatus(page.status, page.details), statusCode: page.statusCode, alt: asset.alt })
    }
  }
  return {
    property,
    counts: { totalPages, indexedPages: indexedPagesCount, links: linksCount, crawlErrors: crawlErrorsCount, contentSamples: contentItems.length },
    recentPages: recentPageRows.map((page): ManagedPage => ({ id: page.id, url: page.url, title: page.title || "No title", siteUrl: page.domain.domain, status: readPageResultStatus(page.status, page.details) as ManagedPage["status"], statusCode: page.statusCode, lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never", createdAt: page.discoveredOn ?? new Date(0), category: page.category, description: page.description || "No description", content: page.content || undefined })),
    indexedPages: indexedPageRows.map((page): ManagedPage => ({ id: page.id, url: page.url, title: page.title || "No title", siteUrl: page.domain.domain, status: readPageResultStatus(page.status, page.details) as ManagedPage["status"], statusCode: page.statusCode, lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never", createdAt: page.discoveredOn ?? new Date(0), category: page.category, description: page.description || "No description", content: page.content || undefined })),
    crawlErrors: crawlErrorRows.map((page): CrawlIssue => ({ id: page.id, domain: page.domain.domain, url: page.url, title: page.title || "No title", status: readPageResultStatus(page.status, page.details), statusCode: page.statusCode, type: page.statusCode !== null && page.statusCode >= 300 && page.statusCode < 400 ? "Redirect" : page.statusCode !== null && page.statusCode >= 400 ? "Error" : "Skipped", targetUrl: readRedirectTarget(page.details), lastCrawled: page.lastCrawled, addedOn: page.discoveredOn ?? new Date(0) })),
    links: linkRows.map((link) => ({ id: link.id, sourceUrl: link.linkFrom, targetUrl: link.linkTo, sourceDomain: link.from.domain, targetDomain: link.to.domain, sourceType: link.sourceType, anchorText: link.anchorText, firstCrawlOn: link.firstCrawlOn })),
    content: contentItems,
  }
}
