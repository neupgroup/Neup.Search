import { prisma } from "@/lib/prisma"
import type { WorkflowStatus } from "@prisma/client"
import { mapDomainToSite, enrichManagedDomainBranding } from "@/services/projects/view"
import type { ManagedDomain, PaginatedDomains, PaginatedPropertyOptions } from "@/services/neupbot"

const domainStatuses: WorkflowStatus[] = ["discovered", "toCrawl", "crawling", "crawled", "analyzing", "analyzed", "indexed", "unlisted", "deleting"]

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
