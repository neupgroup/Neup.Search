"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logica-logging"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { Prisma } from "@prisma/client"
import * as cheerio from "cheerio"
import { deleteManagedPage, findSitemapReferencesForUrl, neupbotUserAgent, runPageCrawler, type SitemapReference } from "@/services/neupbot"
import { crawlPageToHtml } from "@/services/crawl/html"
import { makeHtmlLinksAbsolute } from "@/services/crawl/links"
import { generatePageInsight } from "@/services/intelligence/page-insight"

export type Page = {
  id: string
  url: string
  type: string
  title: string
  siteUrl: string
  status: "Indexed" | "Error" | "Pending" | "Skipped" | "Redirect"
  domainStatus?: "Requested" | "Pending" | "Active" | "Paused" | "Error" | "Crawling" | "Crawled" | "Cancelled" | "Stopped"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  summary?: string
  category?: string | null
  content?: string
  data?: unknown
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

export type SummaryActionState = {
  success: boolean
  error?: { code: string; description: string }
  result?: { summary: string; category: string | null }
}

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
  title: string | null
  description: string | null
  status: string
  statusCode: number | null
  lastCrawled: Date | null
  addedOn: Date
  category?: string | null
  content?: string | null
  data?: unknown
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

function readSummary(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const summaryEntry = data.find((entry) => {
    return entry && typeof entry === "object" && "kind" in entry && entry.kind === "summary"
  })
  return summaryEntry && typeof summaryEntry === "object" && "summary" in summaryEntry && typeof summaryEntry.summary === "string"
    ? summaryEntry.summary
    : undefined
}

function readStoredSitemapReferences(data: unknown): PageSitemapReference[] {
  if (!Array.isArray(data)) return []

  const references = new Set<string>()
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || !("sitemapReferences" in entry)) continue
    const sitemapReferences = entry.sitemapReferences
    if (!Array.isArray(sitemapReferences)) continue

    for (const reference of sitemapReferences) {
      if (
        reference &&
        typeof reference === "object" &&
        "sitemapUrl" in reference &&
        typeof reference.sitemapUrl === "string"
      ) {
        references.add(reference.sitemapUrl)
      }
    }
  }

  return [...references].map((sitemapUrl) => ({ sitemapUrl }))
}

function mapPage(page: PageRow): Page {
  return {
    id: page.id,
    url: page.url,
    type: page.type,
    title: page.title || "No title",
    description: page.description || "No description",
    siteUrl: page.domain.domain,
    status: page.status as Page["status"],
    domainStatus: page.domain.status as Page["domainStatus"],
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.addedOn,
    summary: readSummary(page.data),
    category: page.category,
    content: page.content || undefined,
    data: page.data,
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
        orderBy: { addedOn: "desc" },
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
        orderBy: { addedOn: "desc" },
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
        orderBy: { addedOn: "desc" },
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
      orderBy: { addedOn: "desc" },
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
    const links = await prisma.link.findMany({
      where: { linkTo: pageUrl },
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

  for (const reference of readStoredSitemapReferences(page.data)) {
    references.set(reference.sitemapUrl, reference)
  }

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

// Generate, persist, and return the page summary through the server action response.
export async function summarizePageAction(_previousState: SummaryActionState, formData: FormData): Promise<SummaryActionState> {
  const pageId = String(formData.get("pageId") || "")
  if (!pageId) {
    return { success: false, error: { code: "page_id_required", description: "Page ID is required." } }
  }

  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { content: true, data: true, url: true, title: true, domain: { select: { categories: true } } },
    })
    if (!page?.content?.trim()) {
      return { success: false, error: { code: "page_content_missing", description: "Page content is missing, so it cannot be summarized." } }
    }
    if (!page.domain.categories) {
      return { success: false, error: { code: "site_category_missing", description: "The site must have a category before page insights can be generated." } }
    }

    const insight = await generatePageInsight({
      pageUrl: page.url,
      pageTitle: page.title || "",
      pageContent: page.content,
      siteCategory: page.domain.categories,
      onGenericDetected: async () => {
        await prisma.page.update({ where: { id: pageId }, data: { category: "generic" } })
      },
    })
    if (insight.categorizationError) {
      await logError({ error: insight.categorizationError, pageId }, "summarizePageAction_categorization")
    }
    const data = (Array.isArray(page?.data) ? page.data.filter((entry) => {
      return entry !== null && !(entry && typeof entry === "object" && "kind" in entry && (entry.kind === "summary" || entry.kind === "categorization"))
    }) : []) as Prisma.InputJsonValue[]
    const previousCategorizationEntry = Array.isArray(page.data) ? page.data.find((entry) => {
      return entry !== null && typeof entry === "object" && "kind" in entry && entry.kind === "categorization"
    }) as Prisma.InputJsonValue | undefined : undefined
    const addedOn = new Date().toISOString()

    await prisma.page.update({
      where: { id: pageId },
      data: {
        ...(!insight.categorizationError ? { category: insight.category } : {}),
        data: [
          ...data,
          {
            kind: "summary",
            summary: insight.summary,
            addedOn,
          },
          ...(!insight.categorizationError
            ? [{ kind: "categorization", category: insight.category, addedOn }]
            : previousCategorizationEntry ? [previousCategorizationEntry] : []),
        ],
      },
    })
    return { success: true, result: { summary: insight.summary, category: insight.category } }
  } catch (error) {
    await logError({ error, pageId }, "summarizePageAction")
    return {
      success: false,
      error: { code: "summary_generation_failed", description: "Could not generate the summary. Please try again." },
    }
  } finally {
    revalidatePath(`/manage/pages/${pageId}`)
  }
}

export async function crawlPageAction(formData: FormData) {
  const pageId = String(formData.get("pageId") || "")

  if (!pageId) {
    throw new Error("pageId is required.")
  }

  try {
    await runPageCrawler(pageId)
  } catch (error) {
    await logError({ error, pageId }, "crawlPageAction")
  } finally {
    revalidatePath(`/manage/pages/${pageId}`)
    revalidatePath("/manage/pages")
  }
}

export async function deletePageAction(formData: FormData) {
  const pageId = String(formData.get("pageId") || "")

  if (!pageId) {
    throw new Error("pageId is required.")
  }

  let siteId: string | undefined

  try {
    const deletedPage = await deleteManagedPage(pageId)
    siteId = deletedPage?.siteId
  } catch (error) {
    await logError({ error, pageId }, "deletePageAction")
    throw new Error("Could not delete page.")
  }

  revalidatePath("/manage/pages")
  if (siteId) revalidatePath(`/manage/sites/${siteId}`)
  redirect("/manage/pages")
}
