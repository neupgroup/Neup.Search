import * as cheerio from "cheerio"
import { chromium } from "playwright"
import type { Prisma } from "@prisma/client"
import { summarizeSite } from "@/ai/flows/summarize-site-flow"
import { logError } from "@/lib/logging"
import { prisma } from "@/lib/prisma"

export const neupbotUserAgent = "NeupBot/1.0 (+https://neupgroup.com/neupbot; crawler.neupbot@neupgroup.com)"

export type DomainDetails = {
  description?: string
  summary?: string
  logoUrl?: string
  currentActivity?: string
  pagesCrawled?: number
}

export type ManagedDomain = {
  id: string
  url: string
  description: string
  status: "Pending" | "Active" | "Paused" | "Error" | "Crawling"
  lastCrawled: string | null
  createdAt: Date
  pagesCrawled?: number
  currentlyCrawling?: string
  name?: string
  summary?: string
  logoUrl?: string
}

export type ManagedPage = {
  id: string
  url: string
  title: string
  siteUrl: string
  status: "Indexed" | "Error" | "Pending" | "Skipped" | "Redirect"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  content?: string
}

export type PaginatedDomains = {
  sites: ManagedDomain[]
  lastVisibleId: string | null
}

export type PaginatedDomainPages = {
  pages: ManagedPage[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export type CrawlIssue = {
  id: string
  domain: string
  url: string
  title: string
  status: string
  statusCode: number | null
  type: "Redirect" | "Error" | "Skipped"
  targetUrl?: string
  lastCrawled: Date | null
  addedOn: Date
}

export type PageIssueKind = "link" | "file" | "image-alt" | "image-caption" | "video-alt" | "iframe"

export type PageIssue = {
  id: string
  kind: PageIssueKind
  severity: "error" | "warning"
  title: string
  message: string
  url?: string
  status?: string
  statusCode?: number | null
}

export type SitemapReference = {
  sitemapUrl: string
}

export type ContentKind = "image" | "video" | "audio" | "text" | "document" | "iframe"

export type ContentItem = {
  id: string
  url: string
  kind: ContentKind
  fileType: string
  sourcePageId: string
  sourcePageUrl: string
  sourcePageTitle: string
  siteUrl: string
  status: string
  statusCode: number | null
  alt?: string
}

export type PaginatedContentItems = {
  items: ContentItem[]
  page: number
  pageSize: number
  hasNextPage: boolean
}

type SitemapUrlEntry = {
  url: string
  sitemapUrl: string
}

type SitemapDiscoveryOptions = {
  siteId?: string
  referrer?: string
}

type DiscoveredPageInput = {
  siteId: string
  url: string
  referrer?: string
  source: "seed" | "sitemap" | "anchor" | "image" | "video" | "audio" | "iframe" | "asset" | "redirect"
  kind?: ContentKind | "page" | "asset"
  fileType?: string | null
  sitemapReferences?: SitemapReference[]
}

type PageAsset = {
  url: string
  source: DiscoveredPageInput["source"]
  kind?: ContentKind | "asset"
  fileType?: string | null
  alt?: string
}

type PersistedPageData = {
  title?: string | null
  description?: string | null
  type: string
  data: Prisma.InputJsonValue[]
  fullContent?: string | null
  status: ManagedPage["status"]
  statusCode?: number | null
  details?: Prisma.InputJsonValue
}

const imageFileTypes = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "ico", "bmp", "tif", "tiff"])
const videoFileTypes = new Set(["mp4", "webm", "mov", "m4v", "avi", "mpeg", "mpg", "ogv"])
const audioFileTypes = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "weba"])
const textFileTypes = new Set(["txt", "csv", "json", "xml", "html", "htm", "css", "js", "ts", "md", "log"])
const documentFileTypes = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"])

export function classifyContentSlug(slug: string): { kind?: ContentKind; fileType?: string } | null {
  const normalizedSlug = slug.toLowerCase()

  if (normalizedSlug === "content") return {}
  if (normalizedSlug === "image") return { kind: "image" }
  if (normalizedSlug === "video") return { kind: "video" }
  if (normalizedSlug === "audio") return { kind: "audio" }
  if (normalizedSlug === "iframe") return { kind: "iframe" }
  if (normalizedSlug === "text") return { kind: "text" }
  if (normalizedSlug === "document") return { kind: "document" }
  if (imageFileTypes.has(normalizedSlug)) return { kind: "image", fileType: normalizedSlug }
  if (videoFileTypes.has(normalizedSlug)) return { kind: "video", fileType: normalizedSlug }
  if (audioFileTypes.has(normalizedSlug)) return { kind: "audio", fileType: normalizedSlug }
  if (textFileTypes.has(normalizedSlug)) return { kind: "text", fileType: normalizedSlug }
  if (documentFileTypes.has(normalizedSlug)) return { kind: "document", fileType: normalizedSlug }

  return null
}

export class InvalidDomainError extends Error {
  constructor(message = "Please enter a valid domain.") {
    super(message)
    this.name = "InvalidDomainError"
  }
}

export function normalizeSiteUrl(input: string) {
  const url = new URL(input)
  url.hash = ""
  url.pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")
  url.search = ""
  return url.toString()
}

function isIpv4Address(hostname: string) {
  const parts = hostname.split(".")
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255 && String(value) === part
  })
}

export function isValidDomainHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")

  if (
    !normalizedHostname ||
    normalizedHostname.length > 253 ||
    normalizedHostname.includes("..") ||
    normalizedHostname.includes(":") ||
    normalizedHostname === "localhost" ||
    isIpv4Address(normalizedHostname)
  ) {
    return false
  }

  const labels = normalizedHostname.split(".")
  const tld = labels[labels.length - 1]

  if (labels.length < 2 || tld.length < 2 || /^\d+$/.test(tld)) {
    return false
  }

  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

export function assertValidSiteDomain(input: string) {
  const hostname = getDomainName(input)
  if (!isValidDomainHostname(hostname)) {
    throw new InvalidDomainError()
  }
}

export function getDomainName(input: string) {
  return new URL(input).hostname
}

function normalizeCrawlTarget(input: string) {
  const url = new URL(input)
  return url.origin + url.pathname
}

function addSitemapReference(
  references: Map<string, Set<string>>,
  pageUrl: string,
  sitemapUrl: string,
) {
  const normalizedUrl = normalizeCrawlTarget(pageUrl)
  const sitemapUrls = references.get(normalizedUrl) ?? new Set<string>()
  sitemapUrls.add(sitemapUrl)
  references.set(normalizedUrl, sitemapUrls)
}

function readSitemapReferences(
  references: Map<string, Set<string>>,
  pageUrl: string,
): SitemapReference[] {
  return [...(references.get(normalizeCrawlTarget(pageUrl)) ?? [])].map((sitemapUrl) => ({
    sitemapUrl,
  }))
}

async function recordSitemapDiscovery(siteId: string | undefined, sitemapUrl: string, referrer?: string) {
  if (!siteId) return

  try {
    await prisma.sitemap.upsert({
      where: {
        siteId_sitemapUrl: {
          siteId,
          sitemapUrl,
        },
      },
      create: {
        siteId,
        sitemapUrl,
        referrer,
      },
      update: {
        referrer,
      },
    })
  } catch (error) {
    await logError({ error, siteId, sitemapUrl, referrer }, "recordSitemapDiscovery")
  }
}

function getUrlFileType(input: string): string | null {
  try {
    const pathname = new URL(input).pathname
    const fileName = pathname.split("/").pop() || ""
    const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null
    return extension || null
  } catch {
    return null
  }
}

function classifyContentUrl(url: string): { kind: ContentKind; fileType: string } | null {
  const fileType = getUrlFileType(url)
  if (!fileType) return null
  if (imageFileTypes.has(fileType)) return { kind: "image", fileType }
  if (videoFileTypes.has(fileType)) return { kind: "video", fileType }
  if (audioFileTypes.has(fileType)) return { kind: "audio", fileType }
  if (textFileTypes.has(fileType)) return { kind: "text", fileType }
  if (documentFileTypes.has(fileType)) return { kind: "document", fileType }
  return null
}

function getUrlTitle(input: string) {
  try {
    const pathname = new URL(input).pathname
    const fileName = pathname.split("/").filter(Boolean).pop()
    return fileName ? decodeURIComponent(fileName) : input
  } catch {
    return input
  }
}

function normalizeDiscoveredUrl(input: string, baseUrl: string) {
  const url = new URL(input, baseUrl)
  url.hash = ""
  return url.toString()
}

function readContentLength(headers: Headers | Record<string, string | string[] | undefined>) {
  const rawValue = headers instanceof Headers ? headers.get("content-length") : headers["content-length"]
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  if (!value) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

async function readStaticFileSize(response: Response) {
  const headerSize = readContentLength(response.headers)
  if (headerSize !== null) return headerSize

  try {
    return (await response.arrayBuffer()).byteLength
  } catch {
    return null
  }
}

function buildDiscoveryDetails(input: DiscoveredPageInput): Prisma.InputJsonObject {
  return {
    discoveredFrom: input.referrer || null,
    discoverySource: input.source,
    kind: input.kind || classifyContentUrl(input.url)?.kind || "page",
    fileType: input.fileType || classifyContentUrl(input.url)?.fileType || null,
    sitemapReferences: input.sitemapReferences || [],
  }
}

async function saveDiscoveredPage(input: DiscoveredPageInput) {
  const content = classifyContentUrl(input.url)
  const details = buildDiscoveryDetails(input)
  const existingPage = await prisma.page.findFirst({
    where: { domainId: input.siteId, url: input.url },
    select: { id: true, status: true, details: true },
  })

  if (existingPage) {
    await prisma.page.update({
      where: { id: existingPage.id },
      data: {
        details: {
          ...(existingPage.details && typeof existingPage.details === "object" && !Array.isArray(existingPage.details) ? existingPage.details : {}),
          ...details,
        },
      },
    })
    return existingPage.id
  }

  const created = await prisma.page.create({
    data: {
      domainId: input.siteId,
      url: input.url,
      title: content ? getUrlTitle(input.url) : null,
      description: null,
      type: input.fileType || content?.fileType || "unknown",
      data: [],
      details,
      fullContent: null,
      status: "Pending",
      statusCode: null,
    },
    select: { id: true },
  })

  return created.id
}

async function saveDiscoveredLink(siteId: string, sourceUrl: string, targetUrl: string) {
  const targetHostname = getDomainName(targetUrl)
  const targetDomain = await prisma.domain.upsert({
    where: { domain: new URL(targetUrl).origin },
    create: {
      domain: new URL(targetUrl).origin,
      name: targetHostname,
      status: "Pending",
      details: {
        discoveredFrom: sourceUrl,
      },
    },
    update: {},
    select: { id: true },
  })

  await prisma.link.upsert({
    where: {
      linkFrom_linkTo_fromDomain_toDomain: {
        linkFrom: sourceUrl,
        linkTo: targetUrl,
        fromDomain: siteId,
        toDomain: targetDomain.id,
      },
    },
    create: {
      linkFrom: sourceUrl,
      linkTo: targetUrl,
      fromDomain: siteId,
      toDomain: targetDomain.id,
    },
    update: {
      linkFrom: sourceUrl,
    },
  })
}

async function saveDiscoveredLinksAndPages(
  siteId: string,
  sourceUrl: string,
  links: string[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
) {
  const seen = new Set<string>()
  for (const href of links) {
    try {
      const absoluteUrl = normalizeDiscoveredUrl(href, sourceUrl)
      if (seen.has(absoluteUrl)) continue
      seen.add(absoluteUrl)

      await saveDiscoveredPage({
        siteId,
        url: absoluteUrl,
        referrer: sourceUrl,
        source: "anchor",
        kind: classifyContentUrl(absoluteUrl)?.kind || "page",
        fileType: classifyContentUrl(absoluteUrl)?.fileType,
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, absoluteUrl),
      })
      await saveDiscoveredLink(siteId, sourceUrl, absoluteUrl)
    } catch {
    }
  }
}

async function saveDiscoveredAssets(
  siteId: string,
  sourceUrl: string,
  assets: PageAsset[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
) {
  const seen = new Set<string>()
  for (const asset of assets) {
    try {
      const absoluteUrl = normalizeDiscoveredUrl(asset.url, sourceUrl)
      if (seen.has(absoluteUrl)) continue
      seen.add(absoluteUrl)

      const content = classifyContentUrl(absoluteUrl)
      await saveDiscoveredPage({
        siteId,
        url: absoluteUrl,
        referrer: sourceUrl,
        source: asset.source,
        kind: asset.kind || content?.kind || "asset",
        fileType: asset.fileType || content?.fileType,
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, absoluteUrl),
      })

      if (asset.source === "iframe") {
        await saveDiscoveredLink(siteId, sourceUrl, absoluteUrl)
      }
    } catch {
    }
  }
}

async function saveSitemapPages(
  siteId: string,
  entries: SitemapUrlEntry[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
) {
  for (const entry of entries) {
    addSitemapReference(sitemapReferencesByUrl, entry.url, entry.sitemapUrl)
    await saveDiscoveredPage({
      siteId,
      url: entry.url,
      referrer: entry.sitemapUrl,
      source: "sitemap",
      kind: classifyContentUrl(entry.url)?.kind || "page",
      fileType: classifyContentUrl(entry.url)?.fileType,
      sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, entry.url),
    })
  }
}

async function getNextPendingPage(siteId: string) {
  return prisma.page.findFirst({
    where: { domainId: siteId, status: "Pending" },
    orderBy: { addedOn: "asc" },
    select: { id: true, url: true },
  })
}

async function saveCrawledPage(pageId: string, pageData: PersistedPageData) {
  const existingPage = await prisma.page.findUnique({
    where: { id: pageId },
    select: { details: true },
  })
  const existingDetails = existingPage?.details && typeof existingPage.details === "object" && !Array.isArray(existingPage.details)
    ? existingPage.details
    : {}

  await prisma.page.update({
    where: { id: pageId },
    data: {
      title: pageData.title ?? null,
      description: pageData.description ?? null,
      type: pageData.type,
      data: pageData.data,
      fullContent: pageData.fullContent ?? null,
      status: pageData.status,
      statusCode: pageData.statusCode ?? null,
      lastCrawled: new Date(),
      details: {
        ...existingDetails,
        ...(pageData.details && typeof pageData.details === "object" && !Array.isArray(pageData.details) ? pageData.details : {}),
      },
    },
  })
}

function extractPageLinks($: cheerio.Root) {
  return $("a")
    .map((_: number, el: cheerio.Element) => $(el).attr("href"))
    .get()
    .filter(Boolean)
}

function extractPageAssets($: cheerio.Root): PageAsset[] {
  const assets: PageAsset[] = []

  $("img[src]").each((_: number, el: cheerio.Element) => {
    assets.push({ url: $(el).attr("src") || "", source: "image", kind: "image", alt: $(el).attr("alt") || undefined })
  })
  $("video[src], video source[src]").each((_: number, el: cheerio.Element) => {
    assets.push({ url: $(el).attr("src") || "", source: "video", kind: "video" })
  })
  $("audio[src], audio source[src]").each((_: number, el: cheerio.Element) => {
    assets.push({ url: $(el).attr("src") || "", source: "audio", kind: "audio" })
  })
  $("iframe[src]").each((_: number, el: cheerio.Element) => {
    assets.push({ url: $(el).attr("src") || "", source: "iframe", kind: "iframe", fileType: "iframe" })
  })
  $("script[src], link[href], source[src], embed[src], object[data]").each((_: number, el: cheerio.Element) => {
    const url = $(el).attr("src") || $(el).attr("href") || $(el).attr("data") || ""
    assets.push({ url, source: "asset", kind: classifyContentUrl(url)?.kind || "asset", fileType: classifyContentUrl(url)?.fileType })
  })

  return assets.filter((asset) => asset.url)
}

function matchesContentTarget(content: { kind: ContentKind; fileType: string }, target: { kind?: ContentKind; fileType?: string }) {
  if (target.kind && content.kind !== target.kind) return false
  return !target.fileType || content.fileType === target.fileType
}

function readContentAssets(data: unknown, sourcePageUrl: string): Array<{ url: string; alt?: string; kind?: ContentKind; fileType?: string }> {
  if (!Array.isArray(data)) return []

  const assets: Array<{ url: string; alt?: string; kind?: ContentKind; fileType?: string }> = []
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue

    if ("images" in entry && Array.isArray(entry.images)) {
      for (const image of entry.images) {
        if (!image || typeof image !== "object" || !("src" in image) || typeof image.src !== "string") continue
        try {
          assets.push({
            url: new URL(image.src, sourcePageUrl).toString(),
            alt: "alt" in image && typeof image.alt === "string" ? image.alt : undefined,
          })
        } catch {
        }
      }
    }

    if ("videos" in entry && Array.isArray(entry.videos)) {
      for (const video of entry.videos) {
        if (typeof video !== "string") continue
        try {
          assets.push({ url: new URL(video, sourcePageUrl).toString() })
        } catch {
        }
      }
    }

    if ("audios" in entry && Array.isArray(entry.audios)) {
      for (const audio of entry.audios) {
        if (typeof audio !== "string") continue
        try {
          assets.push({ url: new URL(audio, sourcePageUrl).toString() })
        } catch {
        }
      }
    }

    if ("iframes" in entry && Array.isArray(entry.iframes)) {
      for (const iframe of entry.iframes) {
        if (typeof iframe !== "string") continue
        try {
          assets.push({ url: new URL(iframe, sourcePageUrl).toString(), kind: "iframe", fileType: "iframe" })
        } catch {
        }
      }
    }

    if ("bodyHtml" in entry && typeof entry.bodyHtml === "string") {
      const $ = cheerio.load(entry.bodyHtml)
      for (const iframe of $("iframe").toArray()) {
        const src = $(iframe).attr("src")
        if (!src) continue
        try {
          assets.push({ url: new URL(src, sourcePageUrl).toString(), kind: "iframe", fileType: "iframe" })
        } catch {
        }
      }
    }
  }

  return assets
}

function matchesContentSearch(item: ContentItem, search?: string) {
  const normalizedSearch = search?.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [
    item.url,
    item.siteUrl,
    item.sourcePageTitle,
    item.sourcePageUrl,
    item.fileType,
    item.kind,
    item.alt,
  ].some((value) => value?.toLowerCase().includes(normalizedSearch))
}

export async function getContentItemsByFileTypeSlug(
  slug: string,
  page = 1,
  pageSize = 15,
  search?: string,
): Promise<PaginatedContentItems | null> {
  const target = classifyContentSlug(slug)
  if (!target) return null
  const currentPage = Math.max(1, Math.floor(page))
  const resultLimit = Math.min(100, Math.max(1, Math.floor(pageSize)))
  const neededItems = currentPage * resultLimit + 1

  try {
    const pages = await prisma.page.findMany({
      orderBy: { addedOn: "desc" },
      take: neededItems * 5,
      select: {
        id: true,
        url: true,
        title: true,
        type: true,
        data: true,
        status: true,
        statusCode: true,
        domain: {
          select: {
            domain: true,
          },
        },
      },
    })
    const seenUrls = new Set<string>()
    const contentItems: ContentItem[] = []

    for (const page of pages) {
      const sourcePageTitle = page.title || page.url
      const directContent = classifyContentUrl(page.url)

      if (directContent && matchesContentTarget(directContent, target) && !seenUrls.has(page.url)) {
        seenUrls.add(page.url)
        const contentItem = {
          id: `${page.id}:direct`,
          url: page.url,
          kind: directContent.kind,
          fileType: directContent.fileType,
          sourcePageId: page.id,
          sourcePageUrl: page.url,
          sourcePageTitle,
          siteUrl: page.domain.domain,
          status: page.status,
          statusCode: page.statusCode,
        }
        if (matchesContentSearch(contentItem, search)) {
          contentItems.push(contentItem)
        }
        if (contentItems.length >= neededItems) {
          const start = (currentPage - 1) * resultLimit
          return {
            items: contentItems.slice(start, start + resultLimit),
            page: currentPage,
            pageSize: resultLimit,
            hasNextPage: contentItems.length > start + resultLimit,
          }
        }
      }

      for (const asset of readContentAssets(page.data, page.url)) {
        const assetContent = asset.kind && asset.fileType
          ? { kind: asset.kind, fileType: asset.fileType }
          : classifyContentUrl(asset.url)
        if (!assetContent || !matchesContentTarget(assetContent, target) || seenUrls.has(asset.url)) continue

        seenUrls.add(asset.url)
        const contentItem = {
          id: `${page.id}:${asset.url}`,
          url: asset.url,
          kind: assetContent.kind,
          fileType: assetContent.fileType,
          sourcePageId: page.id,
          sourcePageUrl: page.url,
          sourcePageTitle,
          siteUrl: page.domain.domain,
          status: page.status,
          statusCode: page.statusCode,
          alt: asset.alt,
        }
        if (matchesContentSearch(contentItem, search)) {
          contentItems.push(contentItem)
        }
        if (contentItems.length >= neededItems) {
          const start = (currentPage - 1) * resultLimit
          return {
            items: contentItems.slice(start, start + resultLimit),
            page: currentPage,
            pageSize: resultLimit,
            hasNextPage: contentItems.length > start + resultLimit,
          }
        }
      }
    }

    const start = (currentPage - 1) * resultLimit
    return {
      items: contentItems.slice(start, start + resultLimit),
      page: currentPage,
      pageSize: resultLimit,
      hasNextPage: contentItems.length > start + resultLimit,
    }
  } catch (error) {
    await logError({ error, slug }, "getContentItemsByFileTypeSlug")
    return { items: [], page: currentPage, pageSize: resultLimit, hasNextPage: false }
  }
}

export function readDetails(details: unknown): DomainDetails {
  return details && typeof details === "object" && !Array.isArray(details) ? details as DomainDetails : {}
}

function mapDomainToSite(domain: {
  id: string
  domain: string
  name: string
  status: string
  lastCrawled: Date | null
  addedOn: Date
  details: unknown
  _count?: { pages: number }
}): ManagedDomain {
  const details = readDetails(domain.details)
  return {
    id: domain.id,
    url: domain.domain,
    description: details.description || "",
    status: domain.status as ManagedDomain["status"],
    lastCrawled: domain.lastCrawled ? domain.lastCrawled.toLocaleDateString() : "Never",
    createdAt: domain.addedOn,
    pagesCrawled: domain._count?.pages ?? details.pagesCrawled ?? 0,
    currentlyCrawling: details.currentActivity,
    name: domain.name || undefined,
    logoUrl: details.logoUrl,
    summary: details.summary,
  }
}

export async function updateDomainDetails(domainId: string, details: DomainDetails) {
  const existing = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { details: true },
  })
  await prisma.domain.update({
    where: { id: domainId },
    data: {
      details: {
        ...readDetails(existing?.details),
        ...details,
      },
    },
  })
}

export async function createDomainForCrawl(input: { url: string; description: string }) {
  const siteUrl = normalizeSiteUrl(input.url)
  assertValidSiteDomain(siteUrl)

  const domain = await prisma.domain.upsert({
    where: { domain: siteUrl },
    create: {
      domain: siteUrl,
      name: getDomainName(siteUrl),
      status: "Pending",
      details: {
        description: input.description,
        currentActivity: "Queued for crawl.",
        pagesCrawled: 0,
      },
    },
    update: {
      details: {
        description: input.description,
        currentActivity: "Queued for crawl.",
      },
    },
  })

  return { domain, siteUrl }
}

export async function summarizeDomain(siteId: string, siteUrl: string) {
  await updateDomainDetails(siteId, { currentActivity: "Summarizing domain..." })
  const summaryData = await summarizeSite({ url: siteUrl })
  const existing = await prisma.domain.findUnique({
    where: { id: siteId },
    select: { details: true },
  })

  await prisma.domain.update({
    where: { id: siteId },
    data: {
      name: summaryData.name || getDomainName(siteUrl),
      details: {
        ...readDetails(existing?.details),
        summary: summaryData.summary || undefined,
        logoUrl: summaryData.logoUrl || undefined,
        currentActivity: "",
      },
    },
  })
}

export async function markDomainSummaryFailed(siteId: string) {
  await prisma.domain.update({
    where: { id: siteId },
    data: {
      status: "Error",
      details: {
        currentActivity: "Failed to summarize domain.",
      },
    },
  })
}

export async function getManagedDomains(search?: string, startAfterDocId?: string): Promise<PaginatedDomains> {
  const take = 20
  const where = search
    ? {
        OR: [
          { domain: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
          { status: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : undefined

  const rows = await prisma.domain.findMany({
    where,
    orderBy: { addedOn: "desc" },
    take: search ? 1000 : take,
    ...(startAfterDocId && !search ? { cursor: { id: startAfterDocId }, skip: 1 } : {}),
    include: { _count: { select: { pages: true } } },
  })

  const startIndex = search && startAfterDocId ? rows.findIndex((domain) => domain.id === startAfterDocId) + 1 : 0
  const slice = search ? rows.slice(Math.max(startIndex, 0), Math.max(startIndex, 0) + take) : rows
  const sites = slice.map(mapDomainToSite)

  return {
    sites,
    lastVisibleId: (search ? rows.length > Math.max(startIndex, 0) + take : sites.length === take)
      ? sites[sites.length - 1]?.id || null
      : null,
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function getRobotsTxt(siteUrl: string): Promise<string | null> {
  try {
    const robotsUrl = new URL("/robots.txt", siteUrl)
    const response = await fetch(robotsUrl.toString(), { headers: { "User-Agent": neupbotUserAgent } })
    return response.ok ? response.text() : null
  } catch (error) {
    await logError({ error, siteUrl }, "getRobotsTxt")
    return null
  }
}

function parseRobotsTxt(robotsTxt: string): { sitemaps: string[], disallow: RegExp[] } {
  const sitemaps: string[] = []
  const disallow: RegExp[] = []
  let isOurBot = false

  robotsTxt.split("\n").forEach((line) => {
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) return

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key?.toLowerCase() === "user-agent") {
      isOurBot = value === "*" || value === neupbotUserAgent
    } else if (key?.toLowerCase() === "sitemap" && value) {
      sitemaps.push(value)
    } else if (isOurBot && key?.toLowerCase() === "disallow" && value) {
      disallow.push(new RegExp("^" + value.replace(/\*/g, ".*").replace(/\//g, "\\/")))
    }
  })

  return { sitemaps, disallow }
}

async function getSitemapUrlEntries(
  sitemapUrl: string,
  discovery: SitemapDiscoveryOptions = {},
): Promise<SitemapUrlEntry[]> {
  try {
    const response = await fetch(sitemapUrl, { headers: { "User-Agent": neupbotUserAgent } })
    if (!response.ok) return []

    await recordSitemapDiscovery(discovery.siteId, sitemapUrl, discovery.referrer)

    const xml = await response.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    const urls = $("url > loc")
      .map((_: number, el: cheerio.Element): SitemapUrlEntry => ({
        url: $(el).text(),
        sitemapUrl,
      }))
      .get()
    const nestedSitemaps = $("sitemap > loc").map((_: number, el: cheerio.Element) => $(el).text()).get()

    for (const nestedSitemap of nestedSitemaps) {
      urls.push(...await getSitemapUrlEntries(nestedSitemap, {
        siteId: discovery.siteId,
        referrer: sitemapUrl,
      }))
    }

    return urls
  } catch (error) {
    await logError({ error, sitemapUrl }, "getSitemapUrls")
    return []
  }
}

export async function findSitemapReferencesForUrl(pageUrl: string, siteUrl: string): Promise<SitemapReference[]> {
  try {
    const robotsTxt = await getRobotsTxt(siteUrl)
    const { sitemaps } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [] }
    const sitemapUrls = sitemaps.length > 0 ? sitemaps : [new URL("/sitemap.xml", siteUrl).toString()]
    const normalizedPageUrl = normalizeCrawlTarget(pageUrl)
    const references = new Set<string>()

    for (const sitemapUrl of sitemapUrls) {
      const entries = await getSitemapUrlEntries(sitemapUrl)
      for (const entry of entries) {
        if (normalizeCrawlTarget(entry.url) === normalizedPageUrl) {
          references.add(entry.sitemapUrl)
        }
      }
    }

    return [...references].map((sitemapUrl) => ({ sitemapUrl }))
  } catch (error) {
    await logError({ error, pageUrl, siteUrl }, "findSitemapReferencesForUrl")
    return []
  }
}

type CrawlStoredPageInput = {
  siteId: string
  pageId: string
  pageUrl: string
  disallow: RegExp[]
  sitemapReferencesByUrl: Map<string, Set<string>>
  crawledUrls?: Set<string>
}

async function crawlStoredPage({
  siteId,
  pageId,
  pageUrl,
  disallow,
  sitemapReferencesByUrl,
  crawledUrls = new Set<string>(),
}: CrawlStoredPageInput) {
  const parsedCurrentUrl = new URL(pageUrl)
  const normalizedUrl = parsedCurrentUrl.origin + parsedCurrentUrl.pathname

  if (crawledUrls.has(normalizedUrl) || disallow.some((regex) => regex.test(parsedCurrentUrl.pathname))) {
    await saveCrawledPage(pageId, {
      title: getUrlTitle(pageUrl),
      description: null,
      type: "skipped",
      data: [{
        reason: crawledUrls.has(normalizedUrl) ? "Already crawled in this run." : "Blocked by robots.txt.",
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, pageUrl),
      }],
      fullContent: null,
      status: "Skipped",
      statusCode: null,
      details: {
        skippedOn: new Date().toISOString(),
      },
    })
    return false
  }

  try {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": neupbotUserAgent },
      redirect: "manual",
    })
    crawledUrls.add(normalizedUrl)

    const contentType = response.headers.get("content-type")
    const redirectLocation = response.headers.get("location")
    if (response.status >= 300 && response.status < 400) {
      const targetUrl = redirectLocation ? new URL(redirectLocation, pageUrl).toString() : null
      const data = [{
        contentType,
        headers: Object.fromEntries(response.headers.entries()),
        redirectLocation: targetUrl,
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, pageUrl),
      }]
      await saveCrawledPage(pageId, {
        title: null,
        description: null,
        type: contentType || "redirect",
        data,
        fullContent: null,
        status: "Redirect",
        statusCode: response.status,
        details: {
          contentType,
          redirectLocation: targetUrl,
        },
      })

      if (targetUrl) {
        await saveDiscoveredPage({
          siteId,
          url: targetUrl,
          referrer: pageUrl,
          source: "redirect",
          kind: classifyContentUrl(targetUrl)?.kind || "page",
          fileType: classifyContentUrl(targetUrl)?.fileType,
        })
        await saveDiscoveredLink(siteId, pageUrl, targetUrl)
      }
      return false
    }

    const isHtml = contentType?.includes("text/html") ?? false
    if (!response.ok || !isHtml) {
      const fileSize = !isHtml ? await readStaticFileSize(response) : readContentLength(response.headers)
      const content = classifyContentUrl(pageUrl)
      const data = [{
        contentType,
        headers: Object.fromEntries(response.headers.entries()),
        fileSize,
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, pageUrl),
      }]
      await saveCrawledPage(pageId, {
        title: getUrlTitle(pageUrl),
        description: null,
        type: contentType || "unknown",
        data,
        fullContent: null,
        status: response.ok ? "Skipped" : "Error",
        statusCode: response.status,
        details: {
          contentType,
          fileSize,
          kind: content?.kind || "asset",
          fileType: content?.fileType || getUrlFileType(pageUrl),
        },
      })
      return false
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    const pageTitle = $("title").text() || $("h1").first().text()
    const fullContent = $("body").text().replace(/\s\s+/g, " ").trim()
    const data = [{
      keywords: $("meta[name=\"keywords\"]").attr("content") || "",
      bodyHtml: $("body").html() || "",
      httpHeaders: Object.fromEntries(response.headers.entries()),
      canonicalUrl: $("link[rel=\"canonical\"]").attr("href") || null,
      lang: $("html").attr("lang") || null,
      openGraph: {
        title: $("meta[property=\"og:title\"]").attr("content") || null,
        type: $("meta[property=\"og:type\"]").attr("content") || null,
        image: $("meta[property=\"og:image\"]").attr("content") || null,
        url: $("meta[property=\"og:url\"]").attr("content") || null,
      },
      images: $("img").map((_: number, el: cheerio.Element) => ({ src: $(el).attr("src"), alt: $(el).attr("alt") })).get().filter((img: { src?: string | null }) => !!img.src),
      videos: $("video").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
      audios: $("audio").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
      iframes: $("iframe").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
      sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, pageUrl),
    }]

    await saveCrawledPage(pageId, {
      title: pageTitle || null,
      description: $("meta[name=\"description\"]").attr("content") || $("meta[property=\"og:description\"]").attr("content") || null,
      type: "text/html",
      data,
      fullContent,
      status: "Indexed",
      statusCode: response.status,
      details: {
        contentType,
      },
    })

    await saveDiscoveredLinksAndPages(siteId, pageUrl, extractPageLinks($), sitemapReferencesByUrl)
    await saveDiscoveredAssets(siteId, pageUrl, extractPageAssets($), sitemapReferencesByUrl)
    return true
  } catch (fetchError) {
    await logError({ error: fetchError, currentUrl: pageUrl }, "crawlSite_fetch")
    await saveCrawledPage(pageId, {
      title: getUrlTitle(pageUrl),
      description: null,
      type: "fetch-error",
      data: [{
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, pageUrl),
      }],
      fullContent: null,
      status: "Error",
      statusCode: null,
      details: {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      },
    })
    return false
  }
}

export async function runPageCrawler(pageId: string) {
  if (!pageId) {
    throw new Error("pageId is required.")
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      url: true,
      domainId: true,
      domain: { select: { domain: true } },
    },
  })

  if (!page) {
    throw new Error("Page not found.")
  }

  const sitemapReferencesByUrl = new Map<string, Set<string>>()
  const robotsTxt = await getRobotsTxt(page.domain.domain)
  const { disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { disallow: [] }

  for (const reference of await findSitemapReferencesForUrl(page.url, page.domain.domain)) {
    addSitemapReference(sitemapReferencesByUrl, page.url, reference.sitemapUrl)
  }

  await updateDomainDetails(page.domainId, {
    currentActivity: `Crawling ${page.url}`,
  })

  await crawlStoredPage({
    siteId: page.domainId,
    pageId: page.id,
    pageUrl: page.url,
    disallow,
    sitemapReferencesByUrl,
  })

  await prisma.domain.update({
    where: { id: page.domainId },
    data: {
      lastCrawled: new Date(),
      details: {
        ...readDetails((await prisma.domain.findUnique({ where: { id: page.domainId }, select: { details: true } }))?.details),
        currentActivity: "Page crawl complete.",
      },
    },
  })
}

export async function runCrawler(siteId: string, siteUrl: string) {
  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  const crawledUrls = new Set<string>()
  const sitemapReferencesByUrl = new Map<string, Set<string>>()
  let pagesProcessed = 0

  try {
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Crawling",
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          currentActivity: "Fetching robots.txt...",
        },
      },
    })

    const robotsTxt = await getRobotsTxt(siteUrl)
    const { sitemaps, disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] }
    const robotsUrl = new URL("/robots.txt", siteUrl).toString()

    if (sitemaps.length > 0) {
      await updateDomainDetails(siteId, { currentActivity: `Found ${sitemaps.length} sitemaps. Parsing...` })
      for (const sitemapUrl of sitemaps) {
        const entries = await getSitemapUrlEntries(sitemapUrl, { siteId, referrer: robotsUrl })
        await saveSitemapPages(siteId, entries, sitemapReferencesByUrl)
      }
    } else {
      const sitemapEntries = await getSitemapUrlEntries(new URL("/sitemap.xml", siteUrl).toString(), {
        siteId,
        referrer: siteUrl,
      })
      if (sitemapEntries.length > 0) {
        await updateDomainDetails(siteId, { currentActivity: "Found default sitemap.xml. Parsing..." })
        await saveSitemapPages(siteId, sitemapEntries, sitemapReferencesByUrl)
      }
    }

    await saveDiscoveredPage({ siteId, url: siteUrl, source: "seed", kind: "page" })

    while (true) {
      const currentDomain = await prisma.domain.findUnique({ where: { id: siteId }, select: { status: true } })
      if (currentDomain?.status !== "Crawling") {
        await updateDomainDetails(siteId, { currentActivity: "Crawl cancelled." })
        break
      }

      const pendingPage = await getNextPendingPage(siteId)
      if (!pendingPage) break

      await updateDomainDetails(siteId, {
        currentActivity: `Crawling ${pendingPage.url}`,
        pagesCrawled: pagesProcessed,
      })

      const crawledHtmlPage = await crawlStoredPage({
        siteId,
        pageId: pendingPage.id,
        pageUrl: pendingPage.url,
        disallow,
        sitemapReferencesByUrl,
        crawledUrls,
      })
      if (crawledHtmlPage) {
        pagesProcessed++
      }

      await sleep(100)
    }

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Active",
        lastCrawled: new Date(),
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          pagesCrawled: crawledUrls.size,
          currentActivity: "Crawl complete.",
        },
      },
    })
  } catch (error: any) {
    await logError(error, "crawlSite")
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Error",
        details: {
          currentActivity: `Crawl failed: ${error.message}`,
        },
      },
    })
  }
}

export async function runJavascriptCrawler(siteId: string, siteUrl: string) {
  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  const rootDomain = getDomainName(siteUrl)
  const crawledUrls = new Set<string>()
  const sitemapReferencesByUrl = new Map<string, Set<string>>()
  let pagesProcessed = 0
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Crawling",
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          currentActivity: "Starting JavaScript crawler...",
        },
      },
    })

    const robotsTxt = await getRobotsTxt(siteUrl)
    const { sitemaps, disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] }
    const robotsUrl = new URL("/robots.txt", siteUrl).toString()
    const urlQueue: string[] = []

    if (sitemaps.length > 0) {
      await updateDomainDetails(siteId, { currentActivity: `Found ${sitemaps.length} sitemaps. Parsing...` })
      for (const sitemapUrl of sitemaps) {
        const entries = await getSitemapUrlEntries(sitemapUrl, { siteId, referrer: robotsUrl })
        for (const entry of entries) {
          addSitemapReference(sitemapReferencesByUrl, entry.url, entry.sitemapUrl)
          urlQueue.push(entry.url)
        }
      }
    } else {
      const sitemapEntries = await getSitemapUrlEntries(new URL("/sitemap.xml", siteUrl).toString(), {
        siteId,
        referrer: siteUrl,
      })
      if (sitemapEntries.length > 0) {
        await updateDomainDetails(siteId, { currentActivity: "Found default sitemap.xml. Parsing..." })
        for (const entry of sitemapEntries) {
          addSitemapReference(sitemapReferencesByUrl, entry.url, entry.sitemapUrl)
          urlQueue.push(entry.url)
        }
      }
    }

    if (urlQueue.length === 0) {
      urlQueue.push(siteUrl)
    }

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent: neupbotUserAgent,
      ignoreHTTPSErrors: true,
    })
    const renderedPage = await context.newPage()

    while (urlQueue.length > 0) {
      const currentDomain = await prisma.domain.findUnique({ where: { id: siteId }, select: { status: true } })
      if (currentDomain?.status !== "Crawling") {
        await updateDomainDetails(siteId, { currentActivity: "JavaScript crawl cancelled." })
        break
      }

      const currentUrl = urlQueue.shift()!
      const parsedCurrentUrl = new URL(currentUrl)
      const normalizedUrl = parsedCurrentUrl.origin + parsedCurrentUrl.pathname

      if (crawledUrls.has(normalizedUrl) || disallow.some((regex) => regex.test(parsedCurrentUrl.pathname))) {
        continue
      }

      await updateDomainDetails(siteId, {
        currentActivity: `Rendering ${currentUrl}`,
        pagesCrawled: pagesProcessed,
      })

      try {
        let response = await renderedPage.goto(currentUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        }).catch(async () => {
          return renderedPage.goto(currentUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          })
        })

        crawledUrls.add(normalizedUrl)
        const statusCode = response?.status() ?? null
        const headers = response?.headers() ?? {}
        const contentType = headers["content-type"] || "text/html"
        const isHtml = contentType.includes("text/html")

        if (!response || (statusCode !== null && statusCode >= 400) || !isHtml) {
          const existingPage = await prisma.page.findFirst({ where: { url: currentUrl, domainId: siteId }, select: { id: true } })
          const pageData = {
            domainId: siteId,
            url: currentUrl,
            title: null,
            description: null,
            type: contentType || "unknown",
            data: [{
              contentType,
              headers,
              renderedWithJavaScript: true,
              sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, currentUrl),
            }],
            fullContent: null,
            status: statusCode !== null && statusCode >= 400 ? "Error" : "Skipped",
            statusCode,
            lastCrawled: new Date(),
          }

          if (existingPage) {
            await prisma.page.update({ where: { id: existingPage.id }, data: pageData })
          } else {
            await prisma.page.create({ data: pageData })
          }
          continue
        }

        await renderedPage.waitForTimeout(1000)
        const html = await renderedPage.content()
        const $ = cheerio.load(html)
        const pageTitle = $("title").text() || $("h1").first().text()
        const fullContent = $("body").text().replace(/\s\s+/g, " ").trim()
        const data = [{
          keywords: $("meta[name=\"keywords\"]").attr("content") || "",
          bodyHtml: $("body").html() || "",
          httpHeaders: headers,
          canonicalUrl: $("link[rel=\"canonical\"]").attr("href") || null,
          lang: $("html").attr("lang") || null,
          renderedWithJavaScript: true,
          openGraph: {
            title: $("meta[property=\"og:title\"]").attr("content") || null,
            type: $("meta[property=\"og:type\"]").attr("content") || null,
            image: $("meta[property=\"og:image\"]").attr("content") || null,
            url: $("meta[property=\"og:url\"]").attr("content") || null,
          },
          images: $("img").map((_: number, el: cheerio.Element) => ({ src: $(el).attr("src"), alt: $(el).attr("alt") })).get().filter((img: { src?: string | null }) => !!img.src),
          videos: $("video").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
          audios: $("audio").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
          iframes: $("iframe").map((_: number, el: cheerio.Element) => $(el).attr("src")).get().filter(Boolean),
          sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, currentUrl),
        }]
        const pageData = {
          domainId: siteId,
          url: currentUrl,
          title: pageTitle || null,
          description: $("meta[name=\"description\"]").attr("content") || $("meta[property=\"og:description\"]").attr("content") || null,
          type: "text/html",
          data,
          fullContent,
          status: "Indexed",
          statusCode,
          lastCrawled: new Date(),
        }

        const existingPage = await prisma.page.findFirst({ where: { url: currentUrl, domainId: siteId }, select: { id: true } })
        if (existingPage) {
          await prisma.page.update({ where: { id: existingPage.id }, data: pageData })
        } else {
          await prisma.page.create({ data: pageData })
        }

        pagesProcessed++
        const seenTargetUrls = new Set<string>()

        for (const link of $("a").toArray()) {
          const href = $(link).attr("href")
          if (!href) continue
          try {
            const absoluteUrl = new URL(href, currentUrl).toString().split("#")[0]
            if (seenTargetUrls.has(absoluteUrl)) continue
            seenTargetUrls.add(absoluteUrl)

            const targetHostname = getDomainName(absoluteUrl)
            const isInternalLink = targetHostname === rootDomain
            const targetDomain = isInternalLink
              ? { id: siteId }
              : await prisma.domain.upsert({
                  where: { domain: new URL(absoluteUrl).origin },
                  create: {
                    domain: new URL(absoluteUrl).origin,
                    name: targetHostname,
                    status: "Pending",
                    details: {
                      discoveredFrom: currentUrl,
                    },
                  },
                  update: {},
                  select: { id: true },
                })

            await prisma.link.upsert({
              where: {
                linkFrom_linkTo_fromDomain_toDomain: {
                  linkFrom: currentUrl,
                  linkTo: absoluteUrl,
                  fromDomain: siteId,
                  toDomain: targetDomain.id,
                },
              },
              create: {
                linkFrom: currentUrl,
                linkTo: absoluteUrl,
                fromDomain: siteId,
                toDomain: targetDomain.id,
              },
              update: {
                linkFrom: currentUrl,
              },
            })

            if (isInternalLink) {
              const normalizedInternalUrl = new URL(absoluteUrl).origin + new URL(absoluteUrl).pathname
              if (!crawledUrls.has(normalizedInternalUrl) && !urlQueue.includes(absoluteUrl)) {
                urlQueue.push(absoluteUrl)
              }
            }
          } catch {
          }
        }
      } catch (renderError) {
        await logError({ error: renderError, currentUrl }, "runJavascriptCrawler_render")
      }

      await sleep(100)
    }

    await context.close()
    await browser.close()
    browser = null

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Active",
        lastCrawled: new Date(),
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          pagesCrawled: crawledUrls.size,
          currentActivity: "JavaScript crawl complete.",
        },
      },
    })
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => undefined)
    }

    await logError(error, "runJavascriptCrawler")
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Error",
        details: {
          currentActivity: `JavaScript crawl failed: ${error.message}`,
        },
      },
    })
  }
}

export async function getManagedDomainById(siteId: string): Promise<ManagedDomain | null> {
  const domain = await prisma.domain.findUnique({
    where: { id: siteId },
    include: { _count: { select: { pages: true } } },
  })
  return domain ? mapDomainToSite(domain) : null
}

export async function getPagesForDomain(siteId: string, page = 1, pageSize = 20): Promise<PaginatedDomainPages> {
  const resolvedPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)))
  const totalCount = await prisma.page.count({ where: { domainId: siteId } })
  const totalPages = Math.max(1, Math.ceil(totalCount / resolvedPageSize))
  const resolvedPage = Math.min(Math.max(1, Math.floor(page)), totalPages)

  const rows = await prisma.page.findMany({
    where: { domainId: siteId },
    orderBy: { url: "asc" },
    skip: (resolvedPage - 1) * resolvedPageSize,
    take: resolvedPageSize,
    include: { domain: { select: { domain: true, name: true } } },
  })

  const pages = rows.map((page): ManagedPage => ({
    id: page.id,
    url: page.url,
    title: page.title || "No title",
    description: page.description || "No description",
    siteUrl: page.domain.domain,
    status: page.status as ManagedPage["status"],
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.addedOn,
    content: page.fullContent || undefined,
  }))

  return {
    pages,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalCount,
    totalPages,
  }
}

export async function getNeupbotDashboardStats() {
  const totalSites = await prisma.domain.count()
  const totalPages = await prisma.page.count()
  const activeCrawls = await prisma.domain.count({ where: { status: "Crawling" } })
  const crawlErrors = await prisma.domain.count({ where: { status: "Error" } })
  return { totalSites, totalPages, activeCrawls, crawlErrors }
}

export async function cancelDomainCrawl(siteId: string) {
  await prisma.domain.update({
    where: { id: siteId },
    data: {
      status: "Active",
      details: {
        ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
        currentActivity: "Crawl cancelled by user.",
      },
    },
  })
}

export async function deleteDomainPages(siteId: string) {
  await prisma.page.deleteMany({ where: { domainId: siteId } })
  await prisma.domain.update({
    where: { id: siteId },
    data: {
      lastCrawled: null,
      details: {
        ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
        pagesCrawled: 0,
      },
    },
  })
}

export async function getAllCrawlTargets() {
  return prisma.domain.findMany({
    orderBy: { addedOn: "desc" },
    select: { id: true, domain: true },
  })
}

function readRedirectTarget(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const redirectEntry = data.find((entry) => {
    return entry && typeof entry === "object" && "redirectLocation" in entry
  })
  return redirectEntry && typeof redirectEntry === "object" && "redirectLocation" in redirectEntry && typeof redirectEntry.redirectLocation === "string"
    ? redirectEntry.redirectLocation
    : undefined
}

function readPageBodyHtml(data: unknown) {
  if (!Array.isArray(data)) return null

  for (const entry of data) {
    if (entry && typeof entry === "object" && "bodyHtml" in entry && typeof entry.bodyHtml === "string") {
      return entry.bodyHtml
    }
  }

  return null
}

function hasCrawlError(page: { status: string; statusCode: number | null }) {
  return (page.statusCode !== null && page.statusCode >= 400) || page.status === "Error"
}

function isIframeUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().split(".").pop() === "iframe"
  } catch {
    return false
  }
}

function getMediaIssuesFromHtml(bodyHtml: string | null, pageUrl: string): PageIssue[] {
  if (!bodyHtml) return []

  const $ = cheerio.load(bodyHtml)
  const issues: PageIssue[] = []
  const seen = new Set<string>()

  $("img[src]").each((index: number, el: cheerio.Element) => {
    const src = $(el).attr("src")
    if (!src) return

    let url: string
    try {
      url = new URL(src, pageUrl).toString()
    } catch {
      return
    }
    const alt = $(el).attr("alt")?.trim()
    const caption = $(el).closest("figure").find("figcaption").first().text().trim()

    if (!alt) {
      const id = `image-alt:${url}:${index}`
      if (!seen.has(id)) {
        seen.add(id)
        issues.push({
          id,
          kind: "image-alt",
          severity: "warning",
          title: "Image missing alt text",
          message: "This image does not have alt text.",
          url,
        })
      }
    }

    if (!caption) {
      const id = `image-caption:${url}:${index}`
      if (!seen.has(id)) {
        seen.add(id)
        issues.push({
          id,
          kind: "image-caption",
          severity: "warning",
          title: "Image missing caption",
          message: "This image is not inside a figure with a figcaption.",
          url,
        })
      }
    }
  })

  $("video, video source[src]").each((index: number, el: cheerio.Element) => {
    const node = $(el).is("source") ? $(el).closest("video") : $(el)
    const src = $(el).attr("src") || node.attr("src")
    if (!src) return

    const accessibleLabel = node.attr("aria-label")?.trim() || node.attr("title")?.trim()
    if (!accessibleLabel) {
      let url: string
      try {
        url = new URL(src, pageUrl).toString()
      } catch {
        return
      }
      const id = `video-alt:${url}:${index}`
      if (!seen.has(id)) {
        seen.add(id)
        issues.push({
          id,
          kind: "video-alt",
          severity: "warning",
          title: "Video missing label",
          message: "This video does not have a title or aria-label.",
          url,
        })
      }
    }
  })

  return issues
}

function getMediaIssuesFromStoredAssets(data: unknown, pageUrl: string): PageIssue[] {
  if (readPageBodyHtml(data)) return []

  return readContentAssets(data, pageUrl).flatMap((asset, index): PageIssue[] => {
    const content = asset.kind && asset.fileType ? { kind: asset.kind, fileType: asset.fileType } : classifyContentUrl(asset.url)
    if (content?.kind !== "image") return []

    const issues: PageIssue[] = []
    if (!asset.alt?.trim()) {
      issues.push({
        id: `image-alt:${asset.url}:${index}`,
        kind: "image-alt",
        severity: "warning",
        title: "Image missing alt text",
        message: "This image does not have alt text.",
        url: asset.url,
      })
    }
    issues.push({
      id: `image-caption:${asset.url}:${index}`,
      kind: "image-caption",
      severity: "warning",
      title: "Image missing caption",
      message: "No caption data was found for this image.",
      url: asset.url,
    })

    return issues
  })
}

export async function getPageIssues(pageId: string): Promise<PageIssue[]> {
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        url: true,
        domainId: true,
        data: true,
      },
    })

    if (!page) return []

    const bodyHtml = readPageBodyHtml(page.data)
    const issues = [
      ...getMediaIssuesFromHtml(bodyHtml, page.url),
      ...getMediaIssuesFromStoredAssets(page.data, page.url),
    ]

    const outboundLinks = await prisma.link.findMany({
      where: {
        fromDomain: page.domainId,
        linkFrom: page.url,
      },
      select: {
        id: true,
        linkTo: true,
      },
    })
    const targetUrls = [...new Set([
      ...outboundLinks.map((link) => link.linkTo),
      ...readContentAssets(page.data, page.url).map((asset) => asset.url),
    ])]

    if (targetUrls.length === 0) return issues

    const targetPages = await prisma.page.findMany({
      where: { url: { in: targetUrls } },
      select: {
        id: true,
        url: true,
        title: true,
        status: true,
        statusCode: true,
        type: true,
        details: true,
      },
    })
    const targetPageByUrl = new Map(targetPages.map((targetPage) => [targetPage.url, targetPage]))

    for (const link of outboundLinks) {
      const targetPage = targetPageByUrl.get(link.linkTo)
      if (!targetPage || !hasCrawlError(targetPage)) continue

      const content = classifyContentUrl(link.linkTo)
      issues.push({
        id: `link:${link.id}`,
        kind: content ? "file" : "link",
        severity: "error",
        title: content ? "Linked file has a crawl error" : "Linked page has a crawl error",
        message: targetPage.statusCode === 404 ? "This linked URL returned 404." : "This linked URL returned a crawl error.",
        url: link.linkTo,
        status: targetPage.status,
        statusCode: targetPage.statusCode,
      })
    }

    for (const asset of readContentAssets(page.data, page.url)) {
      const targetPage = targetPageByUrl.get(asset.url)
      if (!targetPage || !hasCrawlError(targetPage)) continue

      const content = asset.kind && asset.fileType
        ? { kind: asset.kind, fileType: asset.fileType }
        : classifyContentUrl(asset.url)
      const kind = content?.kind === "iframe" || isIframeUrl(asset.url) ? "iframe" : "file"

      issues.push({
        id: `${kind}:${targetPage.id}:${asset.url}`,
        kind,
        severity: "error",
        title: kind === "iframe" ? "Iframe has a crawl error" : "Embedded file has a crawl error",
        message: targetPage.statusCode === 404 ? "This embedded URL returned 404." : "This embedded URL returned a crawl error.",
        url: asset.url,
        status: targetPage.status,
        statusCode: targetPage.statusCode,
      })
    }

    const seen = new Set<string>()
    return issues.filter((issue) => {
      const key = `${issue.kind}:${issue.url || issue.id}:${issue.statusCode || ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (error) {
    await logError({ error, pageId }, "getPageIssues")
    return []
  }
}

export async function getCrawlIssues(): Promise<CrawlIssue[]> {
  const pages = await prisma.page.findMany({
    where: {
      OR: [
        { statusCode: { gte: 300 } },
        { status: { in: ["Error", "Redirect", "Skipped"] } },
      ],
    },
    orderBy: [
      { lastCrawled: "desc" },
      { addedOn: "desc" },
    ],
    take: 200,
    include: {
      domain: {
        select: {
          domain: true,
        },
      },
    },
  })

  return pages.map((page) => {
    const isRedirect = page.statusCode !== null && page.statusCode >= 300 && page.statusCode < 400
    const isError = page.statusCode !== null && page.statusCode >= 400
    return {
      id: page.id,
      domain: page.domain.domain,
      url: page.url,
      title: page.title || "No title",
      status: page.status,
      statusCode: page.statusCode,
      type: isRedirect ? "Redirect" : isError ? "Error" : "Skipped",
      targetUrl: readRedirectTarget(page.data),
      lastCrawled: page.lastCrawled,
      addedOn: page.addedOn,
    }
  })
}
