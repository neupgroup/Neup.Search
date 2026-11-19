"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logica-logging"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"
import { findSitemapReferencesForUrl, neupbotUserAgent, runPageCrawler, type SitemapReference } from "@/services/neupbot"
import { crawlPageToHtml } from "@/services/crawl/html"

export type Page = {
  id: string
  url: string
  type: string
  title: string
  siteUrl: string
  status: string
  domainStatus?: "discovered" | "requesting" | "requested" | "paused" | "toCrawl" | "crawling" | "crawled" | "analyzing" | "analyzed" | "indexed"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  summary?: string
  category?: string | null
  content?: string
  isCrawling: boolean
}

export type PageSitemapReference = SitemapReference

export type PageDiscoverySource = {
  id: string
  url: string
  title: string
  site: string
  kind: string
}

export type PageDiscoveryStatus = {
  kind: string
  discoverySource: string | null
  discoveredFrom: string | null
  insideSite: PageDiscoverySource[]
  outsideSite: PageDiscoverySource[]
  insideSiteCount: number
  outsideSiteCount: number
}

export type LiveCrawlerDataState = {
  data?: {
    html: string
  }
  error?: string
}

export type PaginatedPages = {
  pages: Page[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

type PageRow = {
  id: string
  url: string
  type: string
  title: string | null
  description: string | null
  status: string
  details?: unknown
  statusCode: number | null
  lastCrawled: Date | null
  discoveredOn: Date | null
  category?: string | null
  content?: string | null
  crawlLeaseUntil?: Date | null
  domain: {
    domain: string
    status?: string
  }
}

type PageSearchFilter =
  | { kind: "text"; value: string }
  | { kind: "link"; candidates: string[] }
  | { kind: "pages"; candidates: string[] }
  | { kind: "status"; statusCode: number }
  | null

function decodeSearchUrl(input: string) {
  try {
    return decodeURIComponent(input.trim())
  } catch {
    return input.trim()
  }
}

function trimTrailingSlashBeforeQuery(pathname: string) {
  const trimmedPathname = pathname.replace(/\/+$/, "")
  return trimmedPathname || ""
}

function buildUrlCandidates(input: string) {
  const decodedInput = decodeSearchUrl(input)
  const hasProtocol = /^https?:\/\//i.test(decodedInput)
  const parsedUrl = new URL(hasProtocol ? decodedInput : `https://${decodedInput}`)
  const hostname = parsedUrl.hostname.toLowerCase()
  const alternateHostname = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`
  const hostnames = [hostname, alternateHostname]
  const schemes = ["https", "http"]
  const pathname = trimTrailingSlashBeforeQuery(parsedUrl.pathname)
  const suffix = `${pathname}${parsedUrl.search}${parsedUrl.hash}`
  const candidates = new Set<string>()

  for (const scheme of schemes) {
    for (const candidateHostname of hostnames) {
      const withoutTrailingSlash = `${scheme}://${candidateHostname}${suffix}`
      candidates.add(withoutTrailingSlash)

      if (parsedUrl.search || parsedUrl.hash) {
        const trailingPathname = pathname ? `${pathname}/` : "/"
        candidates.add(`${scheme}://${candidateHostname}${trailingPathname}${parsedUrl.search}${parsedUrl.hash}`)
      } else {
        candidates.add(`${withoutTrailingSlash}/`)
      }
    }
  }

  return [...candidates]
}

function looksLikeUrlSearch(input: string) {
  const decodedInput = decodeSearchUrl(input)
  if (/\s/.test(decodedInput)) return false

  return /^https?:\/\//i.test(decodedInput) || /^[^/:?#]+\.[^/:?#]+/.test(decodedInput)
}

function parsePageSearch(search?: string): PageSearchFilter {
  const trimmedSearch = search?.trim()
  if (!trimmedSearch) return null

  const operatorMatch = trimmedSearch.match(/^(link|page|pages|status):(.+)$/i)
  if (!operatorMatch) {
    if (looksLikeUrlSearch(trimmedSearch)) {
      try {
        return { kind: "link", candidates: buildUrlCandidates(trimmedSearch) }
      } catch {
        return { kind: "text", value: trimmedSearch }
      }
    }

    return { kind: "text", value: trimmedSearch }
  }

  try {
    if (operatorMatch[1].toLowerCase() === "status") {
      const statusCode = Number.parseInt(operatorMatch[2].trim(), 10)
      return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? { kind: "status", statusCode }
        : { kind: "text", value: trimmedSearch }
    }

    const candidates = buildUrlCandidates(operatorMatch[2])
    return ["link", "page"].includes(operatorMatch[1].toLowerCase())
      ? { kind: "link", candidates }
      : { kind: "pages", candidates }
  } catch {
    return { kind: "text", value: trimmedSearch }
  }
}

function mapPage(page: PageRow): Page {
  return {
    id: page.id,
    url: page.url,
    type: page.type,
    title: page.title || "No title",
    description: page.description || "No description",
    siteUrl: page.domain.domain,
    status: page.status,
    domainStatus: page.domain.status as Page["domainStatus"],
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.discoveredOn ?? new Date(0),
    summary: page.details && typeof page.details === "object" && !Array.isArray(page.details) && "summary" in page.details && typeof page.details.summary === "string" ? page.details.summary : undefined,
    category: page.category,
    content: page.content || undefined,
    isCrawling: Boolean(page.crawlLeaseUntil && page.crawlLeaseUntil > new Date()),
  }
}

const nonPageFileExtensions = [
  "jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico", "bmp", "tif", "tiff", "heic", "heif", "psd",
  "mp4", "webm", "mov", "m4v", "avi", "mpeg", "mpg", "ogv", "mkv", "flv", "wmv", "3gp", "3g2",
  "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "weba", "mka", "mid", "midi",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "epub", "mobi",
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso", "cab", "exe", "dmg", "apk", "deb", "rpm", "msi", "bin", "dll", "so",
  "woff", "woff2", "ttf", "otf", "eot", "txt", "csv", "json", "xml", "css", "js", "mjs", "ts", "md", "log",
]

export async function getPages(search?: string, page = 1, pageSize = 20, propertyId?: string): Promise<PaginatedPages> {
  try {
    const currentPage = Math.max(1, Math.floor(page))
    const limit = Math.min(100, Math.max(1, Math.floor(pageSize)))
    const searchFilter = parsePageSearch(search)
    const baseWhere: Prisma.PageWhereInput = {
      ...(propertyId ? { domainId: propertyId } : {}),
      AND: [
        { type: { in: ["unknown", "text/html", "application/xhtml+xml", "html", "htm"] } },
        { NOT: nonPageFileExtensions.map((extension) => ({ url: { contains: `.${extension}`, mode: "insensitive" as const } })) },
      ],
    }
    const where = searchFilter?.kind === "text"
      ? {
          ...baseWhere,
          OR: [
            { url: { contains: searchFilter.value, mode: "insensitive" as const } },
            { title: { contains: searchFilter.value, mode: "insensitive" as const } },
            { description: { contains: searchFilter.value, mode: "insensitive" as const } },
            { content: { contains: searchFilter.value, mode: "insensitive" as const } },
            { domain: { domain: { contains: searchFilter.value, mode: "insensitive" as const } } },
          ],
        }
      : baseWhere

    if (searchFilter?.kind === "link") {
      const urlSearchLimit = 20
      const totalCount = await prisma.page.count({
        where: {
          ...baseWhere,
          url: { in: searchFilter.candidates, mode: "insensitive" as const },
        },
      })
      const totalPages = Math.max(1, Math.ceil(totalCount / urlSearchLimit))
      const resolvedPage = Math.min(currentPage, totalPages)
      const rows = await prisma.page.findMany({
        where: {
          ...baseWhere,
          url: { in: searchFilter.candidates, mode: "insensitive" as const },
        },
        orderBy: { discoveredOn: "desc" },
        skip: (resolvedPage - 1) * urlSearchLimit,
        take: urlSearchLimit,
        include: { domain: { select: { domain: true, status: true } } },
      })

      return {
        pages: rows.map(mapPage),
        page: resolvedPage,
        pageSize: urlSearchLimit,
        totalCount,
        totalPages,
      }
    }

    if (searchFilter?.kind === "pages") {
      const urlSearchLimit = 20
      const pagesWhere = {
        ...baseWhere,
        OR: searchFilter.candidates.map((candidate) => ({
          url: candidate.endsWith("/")
            ? { startsWith: candidate, mode: "insensitive" as const }
            : { equals: candidate, mode: "insensitive" as const },
        })),
      }
      const totalCount = await prisma.page.count({ where: pagesWhere })
      const totalPages = Math.max(1, Math.ceil(totalCount / urlSearchLimit))
      const resolvedPage = Math.min(currentPage, totalPages)
      const rows = await prisma.page.findMany({
        where: pagesWhere,
        orderBy: { discoveredOn: "desc" },
        skip: (resolvedPage - 1) * urlSearchLimit,
        take: urlSearchLimit,
        include: { domain: { select: { domain: true, status: true } } },
      })

      return {
        pages: rows.map(mapPage),
        page: resolvedPage,
        pageSize: urlSearchLimit,
        totalCount,
        totalPages,
      }
    }

    if (searchFilter?.kind === "status") {
      const totalCount = await prisma.page.count({
        where: {
          ...baseWhere,
          statusCode: searchFilter.statusCode,
        },
      })
      const totalPages = Math.max(1, Math.ceil(totalCount / limit))
      const resolvedPage = Math.min(currentPage, totalPages)
      const rows = await prisma.page.findMany({
        where: {
          ...baseWhere,
          statusCode: searchFilter.statusCode,
        },
        orderBy: { discoveredOn: "desc" },
        skip: (resolvedPage - 1) * limit,
        take: limit,
        include: { domain: { select: { domain: true, status: true } } },
      })

      return {
        pages: rows.map(mapPage),
        page: resolvedPage,
        pageSize: limit,
        totalCount,
        totalPages,
      }
    }

    const totalCount = await prisma.page.count({ where })
    const totalPages = Math.max(1, Math.ceil(totalCount / limit))
    const resolvedPage = Math.min(currentPage, totalPages)
    const rows = await prisma.page.findMany({
      where,
      orderBy: { discoveredOn: "desc" },
      skip: (resolvedPage - 1) * limit,
      take: limit,
      include: { domain: { select: { domain: true, status: true } } },
    })

    const pages = rows.map(mapPage)

    return {
      pages,
      page: resolvedPage,
      pageSize: limit,
      totalCount,
      totalPages,
    }
  } catch (error) {
    await logError(error, "getPages")
    return { pages: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 1 }
  }
}

export async function getPageById(pageId: string): Promise<Page | null> {
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: { domain: { select: { domain: true, status: true } } },
    })

    return page ? mapPage(page) : null
  } catch (error) {
    await logError({ error, pageId }, "getPageById")
    return null
  }
}

export async function getPageSitemapReferences(page: Page): Promise<PageSitemapReference[]> {
  const references = new Map<string, PageSitemapReference>()

  for (const reference of await findSitemapReferencesForUrl(page.url, page.siteUrl)) {
    references.set(reference.sitemapUrl, reference)
  }

  return [...references.values()]
}

// Read the recorded page links that explain how a page was discovered.
export async function getPageDiscoveryStatus(pageId: string): Promise<PageDiscoveryStatus | null> {
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { id: true, url: true, domainId: true, type: true, details: true },
    })
    if (!page) return null

    const incomingWhere: Prisma.ResourceWhereInput = {
      OR: [{ linkTo: page.url }, { targetPageId: page.id }],
    }
    const [insideSiteCount, outsideSiteCount, incomingLinks] = await Promise.all([
      prisma.resource.count({ where: { ...incomingWhere, fromDomain: page.domainId } }),
      prisma.resource.count({ where: { ...incomingWhere, fromDomain: { not: page.domainId } } }),
      prisma.resource.findMany({
        where: incomingWhere,
        orderBy: { firstCrawlOn: "desc" },
        take: 100,
        select: {
          id: true,
          linkFrom: true,
          type: true,
          fromDomain: true,
          sourcePageId: true,
          sourceType: true,
          from: { select: { domain: true } },
        },
      }),
    ])

    const sourcePageIds = [...new Set(incomingLinks.flatMap((link) => link.sourcePageId ? [link.sourcePageId] : []))]
    const sourcePages = sourcePageIds.length > 0
      ? await prisma.page.findMany({ where: { id: { in: sourcePageIds } }, select: { id: true, title: true } })
      : []
    const sourceTitleById = new Map(sourcePages.map((sourcePage) => [sourcePage.id, sourcePage.title || "Untitled page"]))
    const mapSource = (link: typeof incomingLinks[number]): PageDiscoverySource => ({
      id: link.id,
      url: link.linkFrom,
      title: link.sourcePageId ? sourceTitleById.get(link.sourcePageId) || link.linkFrom : link.linkFrom,
      site: link.from.domain,
      kind: link.sourceType || link.type,
    })
    const details = page.details && typeof page.details === "object" && !Array.isArray(page.details)
      ? page.details as Record<string, unknown>
      : {}

    return {
      kind: typeof details.kind === "string" ? details.kind : page.type || "unknown",
      discoverySource: typeof details.discoverySource === "string" ? details.discoverySource : null,
      discoveredFrom: typeof details.discoveredFrom === "string" ? details.discoveredFrom : null,
      insideSite: incomingLinks.filter((link) => link.fromDomain === page.domainId).map(mapSource),
      outsideSite: incomingLinks.filter((link) => link.fromDomain !== page.domainId).map(mapSource),
      insideSiteCount,
      outsideSiteCount,
    }
  } catch (error) {
    await logError({ error, pageId }, "getPageDiscoveryStatus")
    return null
  }
}

// Fetch and return only the JavaScript-rendered HTML without changing page or site status.
export async function viewCrawlerDataAction(_prevState: LiveCrawlerDataState, formData: FormData): Promise<LiveCrawlerDataState> {
  const pageUrl = String(formData.get("url") || "")

  if (!pageUrl) {
    return { error: "Page URL is required." }
  }

  try {
    const rendered = await crawlPageToHtml(pageUrl, {
      javascriptEnabled: true,
      userAgent: neupbotUserAgent,
    })
    if (!rendered.html) return { error: "No HTML was returned by the JavaScript-enabled crawler." }

    return {
      data: {
        html: rendered.html,
      },
    }
  } catch (error) {
    await logError({ error, pageUrl }, "viewCrawlerDataAction")
    return { error: "Could not fetch live crawler data for this page." }
  }
}

export type CrawlPageActionState = {
  success: boolean
  error?: string
  alreadyCrawling?: boolean
}

export async function crawlPageAction(_previousState: CrawlPageActionState, formData: FormData): Promise<CrawlPageActionState> {
  const pageId = String(formData.get("pageId") || "")

  if (!pageId) {
    throw new Error("pageId is required.")
  }

  let result: CrawlPageActionState
  try {
    await runPageCrawler(pageId)
    result = { success: true }
  } catch (error) {
    console.error(`[crawlPageAction] Crawl failed for page ${pageId}.`, error)
    await logError({ error, pageId }, "crawlPageAction")
    const alreadyCrawling = error instanceof Error && error.message === "This page is already being crawled."
    result = alreadyCrawling
      ? { success: false, alreadyCrawling: true }
      : { success: false, error: "Could not crawl this page." }
  } finally {
    revalidatePath(`/manage/pages/${pageId}`)
    revalidatePath("/manage/discovery/pages")
  }

  return result
}
