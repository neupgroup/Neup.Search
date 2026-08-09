"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logging"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { summarizePageContent } from "@/ai/flows/summarize-page-flow"
import type { Prisma } from "@prisma/client"
import { deleteManagedPage, findSitemapReferencesForUrl, neupbotUserAgent, runPageCrawler, type SitemapReference } from "../../../../services/neupbot"

export type Page = {
  id: string
  url: string
  title: string
  siteUrl: string
  status: "Indexed" | "Error" | "Pending" | "Skipped" | "Redirect"
  domainStatus?: "Pending" | "Active" | "Paused" | "Error" | "Crawling"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  summary?: string
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

export type LiveCrawlerDataState = {
  data?: {
    url: string
    status: number
    statusText: string
    contentType: string | null
    fetchedAt: string
    html: string
    truncated: boolean
    headers: Array<{ key: string; value: string }>
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
  fullContent?: string | null
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
    title: page.title || "No title",
    description: page.description || "No description",
    siteUrl: page.domain.domain,
    status: page.status as Page["status"],
    domainStatus: page.domain.status as Page["domainStatus"],
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.addedOn,
    summary: readSummary(page.data),
    content: page.fullContent || undefined,
    data: page.data,
  }
}

export async function getPages(search?: string, page = 1, pageSize = 20, propertyId?: string): Promise<PaginatedPages> {
  try {
    const currentPage = Math.max(1, Math.floor(page))
    const limit = Math.min(100, Math.max(1, Math.floor(pageSize)))
    const searchFilter = parsePageSearch(search)
    const baseWhere = propertyId ? { domainId: propertyId } : {}
    const where = searchFilter?.kind === "text"
      ? {
          ...baseWhere,
          OR: [
            { url: { contains: searchFilter.value, mode: "insensitive" as const } },
            { title: { contains: searchFilter.value, mode: "insensitive" as const } },
            { description: { contains: searchFilter.value, mode: "insensitive" as const } },
            { fullContent: { contains: searchFilter.value, mode: "insensitive" as const } },
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
    const html = await response.text()
    const maxLength = 500_000

    return {
      data: {
        url: pageUrl,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
        fetchedAt: new Date().toISOString(),
        html: html.slice(0, maxLength),
        truncated: html.length > maxLength,
        headers: Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
      },
    }
  } catch (error) {
    await logError({ error, pageUrl }, "viewCrawlerDataAction")
    return { error: "Could not fetch live crawler data for this page." }
  }
}

export async function summarizePageAction(pageId: string, pageContent: string) {
  try {
    const { summary } = await summarizePageContent({ content: pageContent })
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { data: true },
    })
    const data = (Array.isArray(page?.data) ? page.data.filter((entry) => {
      return entry !== null && !(entry && typeof entry === "object" && "kind" in entry && entry.kind === "summary")
    }) : []) as Prisma.InputJsonValue[]

    await prisma.page.update({
      where: { id: pageId },
      data: {
        data: [
          ...data,
          {
            kind: "summary",
            summary,
            addedOn: new Date().toISOString(),
          },
        ],
      },
    })
  } catch (error) {
    await logError({ error, pageId }, "summarizePageAction")
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
