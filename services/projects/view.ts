import { prisma } from "@/lib/prisma"
import { getFavicon } from "@/services/properties/getFavicon"
import { neupbotUserAgent } from "@/services/neupbot"
import { classifyContentUrl, readContentAssets, readRedirectTarget } from "@/services/neupbot"
import type { ContentItem, ManagedDomain, PropertyDashboard, DomainDetails, ManagedPage, CrawlIssue } from "@/services/neupbot"

// Convert persisted JSON details into the project details shape.
export function readDetails(details: unknown): DomainDetails {
  return details && typeof details === "object" && !Array.isArray(details) ? details as DomainDetails : {}
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

// Load one managed project by its database ID.
export async function getManagedDomainById(siteId: string): Promise<ManagedDomain | null> {
  const domain = await prisma.domain.findUnique({ where: { id: siteId }, include: { _count: { select: { pages: true } } } })
  return domain ? enrichManagedDomainBranding(mapDomainToSite(domain)) : null
}

// Load the project dashboard and its recent crawl, link, and content summaries.
export async function getPropertyDashboard(propertyId: string): Promise<PropertyDashboard | null> {
  const domain = await prisma.domain.findUnique({ where: { id: propertyId }, include: { _count: { select: { pages: true } } } })
  if (!domain) return null
  const property = mapDomainToSite(domain)
  const [totalPages, indexedPagesCount, linksCount, crawlErrorsCount, recentPageRows, indexedPageRows, crawlErrorRows, linkRows, contentPageRows] = await Promise.all([
    prisma.page.count({ where: { domainId: propertyId } }),
    prisma.page.count({ where: { domainId: propertyId, status: "Indexed" } }),
    prisma.link.count({ where: { OR: [{ fromDomain: propertyId }, { toDomain: propertyId }] } }),
    prisma.page.count({ where: { domainId: propertyId, OR: [{ statusCode: { gte: 300 } }, { status: { in: ["Error", "Redirect", "Skipped"] } }] } }),
    prisma.page.findMany({ where: { domainId: propertyId }, orderBy: [{ lastCrawled: "desc" }, { addedOn: "desc" }], take: 8, include: { domain: { select: { domain: true, name: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId, status: "Indexed" }, orderBy: [{ lastCrawled: "desc" }, { addedOn: "desc" }], take: 8, include: { domain: { select: { domain: true, name: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId, OR: [{ statusCode: { gte: 300 } }, { status: { in: ["Error", "Redirect", "Skipped"] } }] }, orderBy: [{ lastCrawled: "desc" }, { addedOn: "desc" }], take: 8, include: { domain: { select: { domain: true } } } }),
    prisma.link.findMany({ where: { OR: [{ fromDomain: propertyId }, { toDomain: propertyId }] }, orderBy: { firstCrawlOn: "desc" }, take: 10, include: { from: { select: { domain: true } }, to: { select: { domain: true } } } }),
    prisma.page.findMany({ where: { domainId: propertyId }, orderBy: [{ lastCrawled: "desc" }, { addedOn: "desc" }], take: 200, select: { id: true, url: true, title: true, type: true, data: true, status: true, statusCode: true, domain: { select: { domain: true } } } }),
  ])
  const contentItems: ContentItem[] = []
  const seenContentUrls = new Set<string>()
  for (const page of contentPageRows) {
    if (contentItems.length >= 12) break
    const sourcePageTitle = page.title || page.url
    const directContent = classifyContentUrl(page.url)
    if (directContent && !seenContentUrls.has(page.url)) {
      seenContentUrls.add(page.url)
      contentItems.push({ id: `${page.id}:direct`, url: page.url, kind: directContent.kind, fileType: directContent.fileType, sourcePageId: page.id, sourcePageUrl: page.url, sourcePageTitle, siteUrl: page.domain.domain, status: page.status, statusCode: page.statusCode })
    }
    if (contentItems.length >= 12) break
    for (const asset of readContentAssets(page.data, page.url)) {
      if (contentItems.length >= 12) break
      const content = asset.kind && asset.fileType ? { kind: asset.kind, fileType: asset.fileType } : classifyContentUrl(asset.url)
      if (!content || seenContentUrls.has(asset.url)) continue
      seenContentUrls.add(asset.url)
      contentItems.push({ id: `${page.id}:${asset.url}`, url: asset.url, kind: content.kind, fileType: content.fileType, sourcePageId: page.id, sourcePageUrl: page.url, sourcePageTitle, siteUrl: page.domain.domain, status: page.status, statusCode: page.statusCode, alt: asset.alt })
    }
  }
  return {
    property,
    counts: { totalPages, indexedPages: indexedPagesCount, links: linksCount, crawlErrors: crawlErrorsCount, contentSamples: contentItems.length },
    recentPages: recentPageRows.map((page): ManagedPage => ({ id: page.id, url: page.url, title: page.title || "No title", siteUrl: page.domain.domain, status: page.status as ManagedPage["status"], statusCode: page.statusCode, lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never", createdAt: page.addedOn, description: page.description || "No description", content: page.content || undefined })),
    indexedPages: indexedPageRows.map((page): ManagedPage => ({ id: page.id, url: page.url, title: page.title || "No title", siteUrl: page.domain.domain, status: page.status as ManagedPage["status"], statusCode: page.statusCode, lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never", createdAt: page.addedOn, description: page.description || "No description", content: page.content || undefined })),
    crawlErrors: crawlErrorRows.map((page): CrawlIssue => ({ id: page.id, domain: page.domain.domain, url: page.url, title: page.title || "No title", status: page.status, statusCode: page.statusCode, type: page.statusCode !== null && page.statusCode >= 300 && page.statusCode < 400 ? "Redirect" : page.statusCode !== null && page.statusCode >= 400 ? "Error" : "Skipped", targetUrl: readRedirectTarget(page.data), lastCrawled: page.lastCrawled, addedOn: page.addedOn })),
    links: linkRows.map((link) => ({ id: link.id, sourceUrl: link.linkFrom, targetUrl: link.linkTo, sourceDomain: link.from.domain, targetDomain: link.to.domain, sourceType: link.sourceType, anchorText: link.anchorText, firstCrawlOn: link.firstCrawlOn })),
    content: contentItems,
  }
}
