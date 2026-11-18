import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { WorkflowStatus } from "@prisma/client"
import { mapDomainToSite, enrichManagedDomainBranding } from "@/services/projects/view"
import type { ManagedDomain, PaginatedDomains, PaginatedPropertyOptions } from "@/services/neupbot"

const domainStatuses: WorkflowStatus[] = ["discovered", "requesting", "requested", "paused", "toCrawl", "crawling", "crawled", "analyzing", "analyzed", "indexed", "unlisted", "deleting"]

export type ManagedSiteStatusFilter = "all" | "requesting" | "requested" | "paused" | "crawling" | "indexed" | "other"

const managedSiteStatusFilters: Record<Exclude<ManagedSiteStatusFilter, "all" | "other">, WorkflowStatus[]> = {
  requesting: ["requesting"],
  requested: ["requested", "toCrawl"],
  paused: ["paused"],
  crawling: ["crawling"],
  indexed: ["indexed", "analyzed", "crawled"],
}

// Build status and search filters for the managed sites table.
function getManagedSiteWhere(search: string | undefined, status: ManagedSiteStatusFilter): Prisma.DomainWhereInput {
  const conditions: Prisma.DomainWhereInput[] = []
  if (status !== "all") {
    conditions.push(status === "other"
      ? { status: { notIn: [...managedSiteStatusFilters.requesting, ...managedSiteStatusFilters.requested, ...managedSiteStatusFilters.paused, ...managedSiteStatusFilters.crawling, ...managedSiteStatusFilters.indexed] } }
      : { status: { in: managedSiteStatusFilters[status] } })
  }
  if (search) {
    const matchingStatuses = domainStatuses.filter((value) => value.toLowerCase().includes(search.toLowerCase()))
    conditions.push({
      OR: [
        { domain: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        ...(matchingStatuses.length > 0 ? [{ status: { in: matchingStatuses } }] : []),
      ],
    })
  }
  return conditions.length > 0 ? { AND: conditions } : {}
}

// Load site counts and one added-date-sorted page for the manage sites screen.
export async function getManagedSitesPage(input: { search?: string; status?: ManagedSiteStatusFilter; page?: number; pageSize?: number }) {
  const status = input.status ?? "all"
  const search = input.search?.trim() || undefined
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 20)))
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1))
  const where = getManagedSiteWhere(search, status)
  const [totalCount, statusCounts] = await Promise.all([
    prisma.domain.count({ where }),
    prisma.domain.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const sites = await prisma.domain.findMany({
    where,
    orderBy: [{ addedOn: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { _count: { select: { pages: true } } },
  })
  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Partial<Record<WorkflowStatus, number>>
  const filters = {
    all: statusCounts.reduce((sum, row) => sum + row._count._all, 0),
    requesting: counts.requesting ?? 0,
    requested: (counts.requested ?? 0) + (counts.toCrawl ?? 0),
    paused: counts.paused ?? 0,
    crawling: counts.crawling ?? 0,
    indexed: (counts.indexed ?? 0) + (counts.analyzed ?? 0) + (counts.crawled ?? 0),
    other: statusCounts.filter((row) => ![...managedSiteStatusFilters.requesting, ...managedSiteStatusFilters.requested, ...managedSiteStatusFilters.paused, ...managedSiteStatusFilters.crawling, ...managedSiteStatusFilters.indexed].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0),
  }
  return { sites: sites.map(mapDomainToSite), totalCount, totalPages, page, pageSize, filters }
}

// Search domain status labels alongside domain names and hostnames.
function getDomainSearchWhere(search?: string) {
  if (!search) return undefined
  const matchingStatuses = domainStatuses.filter((status) => status.toLowerCase().includes(search.toLowerCase()))
  return {
    OR: [
      { domain: { contains: search, mode: "insensitive" as const } },
      { name: { contains: search, mode: "insensitive" as const } },
      ...(matchingStatuses.length > 0 ? [{ status: { in: matchingStatuses } }] : []),
    ],
  }
}

// List managed projects with cursor pagination.
export async function getManagedDomains(search?: string, startAfterDocId?: string): Promise<PaginatedDomains> {
  const take = 20
  const where = getDomainSearchWhere(search)
  const rows = await prisma.domain.findMany({ where, orderBy: { addedOn: "desc" }, take: search ? 1000 : take, ...(startAfterDocId && !search ? { cursor: { id: startAfterDocId }, skip: 1 } : {}), include: { _count: { select: { pages: true } } } })
  const startIndex = search && startAfterDocId ? rows.findIndex((domain) => domain.id === startAfterDocId) + 1 : 0
  const slice = search ? rows.slice(Math.max(startIndex, 0), Math.max(startIndex, 0) + take) : rows
  const sites = await Promise.all(slice.map((domain) => enrichManagedDomainBranding(mapDomainToSite(domain))))
  return { sites, lastVisibleId: (search ? rows.length > Math.max(startIndex, 0) + take : sites.length === take) ? sites[sites.length - 1]?.id || null : null }
}

// List all matching project options without pagination.
export async function getPropertyOptions(search?: string): Promise<ManagedDomain[]> {
  const trimmedSearch = search?.trim()
  const domains = await prisma.domain.findMany({
    where: getDomainSearchWhere(trimmedSearch),
    orderBy: [{ name: "asc" }, { domain: "asc" }], include: { _count: { select: { pages: true } } },
  })
  return domains.map(mapDomainToSite)
}

// Return a stable page of project options, pinning a selected project to page one.
export async function getPaginatedPropertyOptions(input?: { search?: string; page?: number; pageSize?: number; selectedPropertyId?: string }): Promise<PaginatedPropertyOptions> {
  const trimmedSearch = input?.search?.trim()
  const requestedPageSize = input?.pageSize ?? 10
  const pageSize = Math.min(100, Math.max(1, Math.floor(requestedPageSize)))
  const where = getDomainSearchWhere(trimmedSearch)
  const requestedPage = Math.max(1, Math.floor(input?.page ?? 1))
  const [totalCount, selectedDomain] = await Promise.all([
    prisma.domain.count({ where }),
    input?.selectedPropertyId ? prisma.domain.findFirst({ where: { id: input.selectedPropertyId, ...(where ?? {}) }, select: { id: true, domain: true, name: true, lastCrawled: true, status: true, addedOn: true, details: true, categories: true } }) : Promise.resolve(null),
  ])
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const hasSelectedDomain = Boolean(selectedDomain)
  const shouldPinSelectedDomain = hasSelectedDomain && page === 1
  const skip = hasSelectedDomain ? Math.max(0, (page - 1) * pageSize - 1) : (page - 1) * pageSize
  const domains = await prisma.domain.findMany({
    where: hasSelectedDomain ? { AND: [where ?? {}, { id: { not: input?.selectedPropertyId } }] } : where,
    orderBy: { addedOn: "desc" }, skip, take: shouldPinSelectedDomain ? Math.max(0, pageSize - 1) : pageSize,
    select: { id: true, domain: true, name: true, lastCrawled: true, status: true, addedOn: true, details: true, categories: true },
  })
  return { properties: [...(shouldPinSelectedDomain && selectedDomain ? [mapDomainToSite(selectedDomain)] : []), ...domains.map(mapDomainToSite)], page, pageSize, totalCount, totalPages }
}
