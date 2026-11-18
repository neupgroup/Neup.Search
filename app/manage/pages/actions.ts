"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logica-logging"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"
import * as cheerio from "cheerio"
import { findSitemapReferencesForUrl, neupbotUserAgent, runPageCrawler, type SitemapReference } from "@/services/neupbot"
import { crawlPageToHtml } from "@/services/crawl/html"
import { makeHtmlLinksAbsolute } from "@/services/crawl/links"

export type Page = {
  id: string
  url: string
  type: string
  title: string
  siteUrl: string
  status: string
  domainStatus?: "discovered" | "crawling" | "crawled" | "analyzing" | "analyzed" | "indexed"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  summary?: string
  category?: string | null
  content?: string
  isCrawling: boolean
}

export type Backlink = {
  id: string
  sourceUrl: string
  sourceTitle: string
  sourcePageId?: string
  sourceType?: string | null
  anchorText?: string | null
  altText?: string | null
  titleText?: string | null
}

export type PageSitemapReference = SitemapReference

export type LiveCrawlerDataState = {
  data?: {
    url: string
    status: number
    statusText: string
    contentType: string | null
    fetchedAt: string
    html: string
    javascriptHtml: string
    renderedContent: string
    truncated: boolean
    headers: Array<{ key: string; value: string }>
    imagesMedia: Array<{ url: string; type: string; alt?: string }>
    binaries: Array<{ url: string; label: string }>
    internalLinks: Array<{ url: string; text: string }>
    externalLinks: Array<{ url: string; text: string }>
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

export async function getBacklinks(pageUrl?: string): Promise<Backlink[]> {
  if (!pageUrl) return []

  try {
    const links = await prisma.resource.findMany({
      where: { linkTo: pageUrl, type: "link" },
      orderBy: { firstCrawlOn: "desc" },
      select: {
        id: true,
        linkFrom: true,
        sourceType: true,
        anchorText: true,
        altText: true,
        titleText: true,
      },
    })

    if (links.length === 0) return []

    const sourceUrls = [...new Set(links.map((link) => link.linkFrom))]
    const sourcePages = await prisma.page.findMany({
      where: { url: { in: sourceUrls } },
      select: {
        id: true,
        url: true,
        title: true,
      },
    })
    const sourcePageByUrl = new Map(sourcePages.map((page) => [page.url, page]))

    return links.map((link) => ({
      id: link.id,
      sourceUrl: link.linkFrom,
      sourceTitle: sourcePageByUrl.get(link.linkFrom)?.title || link.linkFrom,
      sourcePageId: sourcePageByUrl.get(link.linkFrom)?.id,
      sourceType: link.sourceType,
      anchorText: link.anchorText,
      altText: link.altText,
      titleText: link.titleText,
    }))
  } catch (error) {
    await logError({ error, pageUrl }, "getBacklinks")
    return []
  }
}

export async function getPageSitemapReferences(page: Page): Promise<PageSitemapReference[]> {
  const references = new Map<string, PageSitemapReference>()

  for (const reference of await findSitemapReferencesForUrl(page.url, page.siteUrl)) {
    references.set(reference.sitemapUrl, reference)
  }

  return [...references.values()]
}

// Extract absolute media, binary, and navigation URLs from the HTML snapshot.
function extractLiveCrawlerResources(html: string, pageUrl: string) {
  const $ = cheerio.load(html)
  const pageOrigin = new URL(pageUrl).origin
  const imagesMedia: Array<{ url: string; type: string; alt?: string }> = []
  const binaries: Array<{ url: string; label: string }> = []
  const internalLinks: Array<{ url: string; text: string }> = []
  const externalLinks: Array<{ url: string; text: string }> = []
  const mediaSeen = new Set<string>()
  const binarySeen = new Set<string>()
  const binaryExtensions = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|exe|dmg|apk|woff2?|ttf|eot)(?:$)/i

  $("img, video[src], video[poster], audio[src], source[src]").each((_, element) => {
    const node = $(element)
    const source = node.attr("src")
      || node.attr("data-src")
      || node.attr("data-lazy-src")
      || node.attr("data-original")
      || node.attr("poster")
      || node.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0]
    if (!source) return
    try {
      const url = new URL(source, pageUrl).toString()
      if (mediaSeen.has(url)) return
      mediaSeen.add(url)
      imagesMedia.push({
        url,
        type: element.tagName.toLowerCase(),
        alt: node.attr("alt") || undefined,
      })
    } catch {
      // Ignore malformed resource URLs.
    }
  })

  $("a[href]").each((_, element) => {
    const node = $(element)
    const rawHref = node.attr("href")
    if (!rawHref) return
    try {
      const target = new URL(rawHref, pageUrl)
      if (target.protocol !== "http:" && target.protocol !== "https:") return
      const url = target.toString()
      const text = node.text().replace(/\s+/g, " ").trim() || node.attr("aria-label") || ""
      if (target.origin === pageOrigin) internalLinks.push({ url, text })
      else externalLinks.push({ url, text })

      if ((node.attr("download") !== undefined || binaryExtensions.test(target.pathname)) && !binarySeen.has(url)) {
        binarySeen.add(url)
        binaries.push({ url, label: text || target.pathname.split("/").pop() || url })
      }
    } catch {
      // Ignore malformed navigation URLs.
    }
  })

  return { imagesMedia, binaries, internalLinks, externalLinks }
}

// Fetch raw and JavaScript rendered HTML, stopping on response headers for non-HTML resources.
export async function viewCrawlerDataAction(_prevState: LiveCrawlerDataState, formData: FormData): Promise<LiveCrawlerDataState> {
  const pageUrl = String(formData.get("url") || "")

  if (!pageUrl) {
    return { error: "Page URL is required." }
  }

  try {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": neupbotUserAgent },
      redirect: "manual",
      cache: "no-store",
    })
    const maxLength = 500_000
    const contentType = response.headers.get("content-type")
    const normalizedContentType = contentType?.split(";")[0].trim().toLowerCase()
    const headers = Array.from(response.headers.entries()).map(([key, value]) => ({ key, value }))
    const baseData = {
      url: response.url || pageUrl,
      status: response.status,
      statusText: response.statusText,
      contentType,
      fetchedAt: new Date().toISOString(),
      headers,
    }

    if (normalizedContentType !== "text/html" && normalizedContentType !== "application/xhtml+xml") {
      return {
        data: {
          ...baseData,
          html: "",
          javascriptHtml: "",
          renderedContent: "",
          truncated: false,
          imagesMedia: [],
          binaries: [],
          internalLinks: [],
          externalLinks: [],
        },
      }
    }

    const rawHtml = await response.text()
    const html = makeHtmlLinksAbsolute(rawHtml, baseData.url)
    let javascriptHtml = ""
    try {
      const rendered = await crawlPageToHtml(baseData.url, {
        javascriptEnabled: true,
        userAgent: neupbotUserAgent,
      })
      const renderedType = (rendered.headers["content-type"] || "").split(";")[0].trim().toLowerCase()
      if (renderedType === "text/html" || renderedType === "application/xhtml+xml") {
        javascriptHtml = makeHtmlLinksAbsolute(rendered.html, rendered.url || baseData.url)
      }
    } catch (renderError) {
      await logError({ error: renderError, pageUrl }, "viewCrawlerDataAction_javascriptRender")
    }
    const displayHtml = javascriptHtml || html
    const $rendered = cheerio.load(displayHtml)
    const resources = extractLiveCrawlerResources(displayHtml, baseData.url)

    return {
      data: {
        ...baseData,
        html: html.slice(0, maxLength),
        javascriptHtml: javascriptHtml.slice(0, maxLength),
        renderedContent: $rendered("body").html() || "",
        truncated: html.length > maxLength || javascriptHtml.length > maxLength,
        ...resources,
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
    revalidatePath("/manage/pages")
  }

  return result
}
