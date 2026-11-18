import * as cheerio from "cheerio"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { assist } from "@neup/logica/assist"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import { crawlPageToHtml } from "@/services/crawl/html"
import { extractMarkdownFromHtml } from "@/services/crawl/markdown"
import { readDetails, mapDomainToSite } from "@/services/projects/view"
import { updateDomainDetails } from "@/services/projects/update"
import { upsertDomainRecord } from "@/services/projects/create"
import { ensureHttpSiteUrl, getDomainName, getPropertyAddress, normalizeSiteUrl } from "@/services/projects/domain"
import { generatePageInsight } from "@/services/intelligence/page-insight"
import { getBasics } from "@/services/intelligence/site-profile"
import { RequestTimeoutError, intelligenceRequestTimeoutMs, withRequestTimeout } from "@/services/intelligence/request-timeout"

export const neupbotUserAgent = "NeupBot/1.0 (+https://neupgroup.com/neupbot; crawler.neupbot@neupgroup.com)"

export type DomainDetails = {
  description?: string
  summary?: string
  siteProfileGeneratedAt?: string
  logoUrl?: string
  appIconUrl?: string
  appIconBackgroundColor?: string
  discoveredFrom?: string
  locations?: string[]
  currentActivity?: string
  currentCrawlUrl?: string
  crawlStartedAt?: string
  pagesCrawled?: number
  internalResourcesFound?: number
  externalResourcesFound?: number
}

export type ManagedDomain = {
  id: string
  url: string
  description: string
  status: "Requested" | "Pending" | "Active" | "Paused" | "Error" | "Crawling" | "Crawled" | "Cancelled" | "Stopped"
  lastCrawled: string | null
  createdAt: Date
  pagesCrawled?: number
  internalResourcesFound?: number
  externalResourcesFound?: number
  currentlyCrawling?: string
  currentCrawlUrl?: string
  name?: string
  summary?: string
  logoUrl?: string
  appIconUrl?: string
  appIconBackgroundColor?: string
  categories: string | null
}

export type ManagedPage = {
  id: string
  url: string
  title: string
  siteUrl: string
  status: string
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  category?: string | null
  description?: string
  content?: string
}

// Read the HTTP crawl result separately from the page's current workflow status.
function getPageResultStatus(status: string, details: unknown): ManagedPage["status"] {
  if (details && typeof details === "object" && !Array.isArray(details) && "crawlResultStatus" in details) {
    const crawlResultStatus = details.crawlResultStatus
    if (crawlResultStatus === "Indexed" || crawlResultStatus === "Error" || crawlResultStatus === "Pending" || crawlResultStatus === "Skipped" || crawlResultStatus === "Redirect") {
      return crawlResultStatus
    }
  }
  return status as ManagedPage["status"]
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

export type PropertyLinkPreview = {
  id: string
  sourceUrl: string
  targetUrl: string
  sourceDomain: string
  targetDomain: string
  sourceType?: string | null
  anchorText?: string | null
  firstCrawlOn: Date
}

export type ManagedLinkType = "incoming" | "outgoing" | "internal" | "tel" | "mailto"

export type ManagedLinkItem = {
  id: string
  type: ManagedLinkType
  sourcePageId: string
  sourcePageTitle: string
  sourceUrl: string
  sourceDomain: string
  targetUrl: string
  targetDomain?: string
  anchorText?: string | null
  titleText?: string | null
  rel?: string | null
  firstCrawlOn: Date
}

export type PaginatedManagedLinks = {
  links: ManagedLinkItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export type PropertyDashboard = {
  property: ManagedDomain
  counts: {
    totalPages: number
    indexedPages: number
    links: number
    crawlErrors: number
    contentSamples: number
  }
  recentPages: ManagedPage[]
  indexedPages: ManagedPage[]
  crawlErrors: CrawlIssue[]
  links: PropertyLinkPreview[]
  content: ContentItem[]
}

export type PaginatedPropertyOptions = {
  properties: ManagedDomain[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
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

type PageLink = {
  url: string
  anchorText?: string
  titleText?: string
  rel?: string
  sourceType?: string
}

type PageAsset = {
  url: string
  source: DiscoveredPageInput["source"]
  kind?: ContentKind | "asset"
  fileType?: string | null
  alt?: string
  titleText?: string
  anchorText?: string
  rel?: string
}

type CrawlResourceStats = {
  internalResourcesFound: number
  externalResourcesFound: number
}

type PersistedPageData = {
  title?: string | null
  description?: string | null
  type: string
  data: Prisma.InputJsonValue[]
  content?: string | null
  category?: string | null
  status: ManagedPage["status"]
  statusCode?: number | null
  details?: Prisma.InputJsonValue
}

type PageFlowStage = "discovered-page" | "crawling-page" | "saved-content" | "reported-errors" | "analyzing-page" | "completed-flow"

const pageFlowActivity: Record<PageFlowStage, string> = {
  "discovered-page": "Starting",
  "crawling-page": "Crawling Page",
  "saved-content": "Saving Content",
  "reported-errors": "Reporting HTML Errors",
  "analyzing-page": "Generating Insights",
  "completed-flow": "Completing",
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

function isInternalCrawlUrl(targetUrl: string, rootHostname: string) {
  return getDomainName(targetUrl) === rootHostname
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

export function classifyContentUrl(url: string): { kind: ContentKind; fileType: string } | null {
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

function isPlaceholderLinkValue(input: string) {
  const normalizedInput = input.trim().toLowerCase()

  return (
    normalizedInput.length === 0 ||
    normalizedInput === "#" ||
    normalizedInput === "/" ||
    normalizedInput === "null" ||
    normalizedInput === "undefined" ||
    normalizedInput === "void(0)" ||
    normalizedInput === "javascript:void(0)" ||
    normalizedInput === "javascript:void(0);" ||
    normalizedInput === "javascript:;" ||
    normalizedInput.startsWith("javascript:") ||
    normalizedInput.startsWith("mailto:") ||
    normalizedInput.startsWith("tel:") ||
    normalizedInput.startsWith("data:")
  )
}

function isIgnoredCrawlUrl(input: string) {
  try {
    const url = new URL(input)
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
    const pathname = url.pathname.toLowerCase()
    const fileType = getUrlFileType(url.toString())

    if (hostname === "localhost") return true
    if (pathname === "/_next" || pathname.startsWith("/_next/")) return true
    if (pathname === "/__nextjs" || pathname.startsWith("/__nextjs/")) return true
    if (pathname.endsWith(".hot-update.js") || pathname.endsWith(".hot-update.json")) return true
    if (fileType === "map" && pathname.includes("/static/")) return true

    return false
  } catch {
    return false
  }
}

function readContentLength(headers: Headers | Record<string, string | string[] | undefined>) {
  const rawValue = headers instanceof Headers ? headers.get("content-length") : headers["content-length"]
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  if (!value) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
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
  if (isIgnoredCrawlUrl(input.url)) return undefined

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
          ...(existingPage.details && typeof existingPage.details === "object" && !Array.isArray(existingPage.details) ? existingPage.details as Prisma.JsonObject : {}),
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
      content: null,
      status: "Pending",
      statusCode: null,
    },
    select: { id: true },
  })

  return created.id
}

// Save the current crawl-flow milestone alongside the page's crawl metadata.
async function setPageFlowStage(pageId: string, stage: PageFlowStage): Promise<void> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { details: true } })
  const currentDetails = page?.details && typeof page.details === "object" && !Array.isArray(page.details)
    ? page.details as Record<string, unknown>
    : {}
  const { crawlFlowStatus: _legacyFlowStatus, ...details } = currentDetails
  await prisma.page.update({
    where: { id: pageId },
    data: { status: stage, details: { ...details, crawlFlowUpdatedAt: new Date().toISOString() } },
  })
}

type DiscoveredLinkInput = {
  siteId: string
  sourceUrl: string
  targetUrl: string
  sourcePageId?: string
  targetPageId?: string
  sourceType?: string
  anchorText?: string
  altText?: string
  titleText?: string
  rel?: string
}

function cleanLinkText(value?: string | null) {
  const text = value?.replace(/\s\s+/g, " ").trim()
  return text || undefined
}

function buildCrawlUrlKey(input: string) {
  const url = new URL(input)
  url.hash = ""
  return url.origin + url.pathname + url.search
}

async function saveDiscoveredLink(input: DiscoveredLinkInput) {
  const { siteId, sourceUrl, targetUrl } = input
  if (isIgnoredCrawlUrl(targetUrl)) return

  const normalizedTargetSiteUrl = normalizeSiteUrl(targetUrl)
  const targetHostname = getPropertyAddress(normalizedTargetSiteUrl)
  const targetDomain = await upsertDomainRecord({
    url: normalizedTargetSiteUrl,
    name: targetHostname,
    status: "Active",
    details: {
      discoveredFrom: sourceUrl,
    },
  })
  const sourcePageId = input.sourcePageId ?? (await prisma.page.findFirst({
    where: { domainId: siteId, url: sourceUrl },
    select: { id: true },
  }))?.id
  const metadata = {
    sourcePageId,
    targetPageId: input.targetPageId,
    sourceType: input.sourceType,
    anchorText: cleanLinkText(input.anchorText),
    altText: cleanLinkText(input.altText),
    titleText: cleanLinkText(input.titleText),
    rel: cleanLinkText(input.rel),
  }

  await prisma.link.upsert({
    where: {
      linkFrom_linkTo_fromDomain_toDomain: {
        linkFrom: sourceUrl,
        linkTo: targetUrl,
        fromDomain: siteId,
        toDomain: targetDomain.domain.id,
      },
    },
    create: {
      linkFrom: sourceUrl,
      linkTo: targetUrl,
      fromDomain: siteId,
      toDomain: targetDomain.domain.id,
      ...metadata,
    },
    update: {
      ...metadata,
    },
  })
}

async function saveDiscoveredLinksAndPages(
  siteId: string,
  sourceUrl: string,
  links: PageLink[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
  rootHostname: string,
  stats: CrawlResourceStats,
  sourcePageId?: string,
) {
  const seen = new Set<string>()
  for (const link of links) {
    if (isPlaceholderLinkValue(link.url)) continue

    try {
      const absoluteUrl = normalizeDiscoveredUrl(link.url, sourceUrl)
      if (isIgnoredCrawlUrl(absoluteUrl)) continue
      const absoluteUrlKey = buildCrawlUrlKey(absoluteUrl)
      if (seen.has(absoluteUrlKey)) continue
      seen.add(absoluteUrlKey)
      const isInternal = isInternalCrawlUrl(absoluteUrl, rootHostname)
      if (isInternal) {
        stats.internalResourcesFound++
      } else {
        stats.externalResourcesFound++
      }

      const targetPageId = isInternal
        ? await saveDiscoveredPage({
            siteId,
            url: absoluteUrl,
            referrer: sourceUrl,
            source: "anchor",
            kind: classifyContentUrl(absoluteUrl)?.kind || "page",
            fileType: classifyContentUrl(absoluteUrl)?.fileType,
            sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, absoluteUrl),
          })
        : undefined
      await saveDiscoveredLink({
        siteId,
        sourceUrl,
        targetUrl: absoluteUrl,
        sourcePageId,
        targetPageId,
        sourceType: link.sourceType || "anchor",
        anchorText: link.anchorText,
        titleText: link.titleText,
        rel: link.rel,
      })
    } catch {
    }
  }
}

async function saveDiscoveredAssets(
  siteId: string,
  sourceUrl: string,
  assets: PageAsset[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
  rootHostname: string,
  stats: CrawlResourceStats,
  sourcePageId?: string,
) {
  const seen = new Set<string>()
  for (const asset of assets) {
    if (isPlaceholderLinkValue(asset.url)) continue

    try {
      const absoluteUrl = normalizeDiscoveredUrl(asset.url, sourceUrl)
      if (isIgnoredCrawlUrl(absoluteUrl)) continue
      const absoluteUrlKey = buildCrawlUrlKey(absoluteUrl)
      if (seen.has(absoluteUrlKey)) continue
      seen.add(absoluteUrlKey)
      const isInternal = isInternalCrawlUrl(absoluteUrl, rootHostname)
      if (isInternal) {
        stats.internalResourcesFound++
      } else {
        stats.externalResourcesFound++
      }

      const content = classifyContentUrl(absoluteUrl)
      const targetPageId = isInternal
        ? await saveDiscoveredPage({
            siteId,
            url: absoluteUrl,
            referrer: sourceUrl,
            source: asset.source,
            kind: asset.kind || content?.kind || "asset",
            fileType: asset.fileType || content?.fileType,
            sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, absoluteUrl),
          })
        : undefined

      await saveDiscoveredLink({
        siteId,
        sourceUrl,
        targetUrl: absoluteUrl,
        sourcePageId,
        targetPageId,
        sourceType: asset.source,
        anchorText: asset.anchorText,
        altText: asset.alt,
        titleText: asset.titleText,
        rel: asset.rel,
      })
    } catch {
    }
  }
}

async function saveSitemapPages(
  siteId: string,
  entries: SitemapUrlEntry[],
  sitemapReferencesByUrl: Map<string, Set<string>>,
  rootHostname: string,
  stats?: CrawlResourceStats,
) {
  for (const entry of entries) {
    if (isIgnoredCrawlUrl(entry.url)) continue

    if (!isInternalCrawlUrl(entry.url, rootHostname)) {
      if (stats) stats.externalResourcesFound++
      continue
    }

    if (stats) stats.internalResourcesFound++
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

async function saveCrawledPage(pageId: string, pageData: PersistedPageData) {
  const existingPage = await prisma.page.findUnique({
    where: { id: pageId },
    select: { details: true, data: true },
  })
  const existingDetails = existingPage?.details && typeof existingPage.details === "object" && !Array.isArray(existingPage.details)
    ? existingPage.details
    : {}
  const previousAnalysis = Array.isArray(existingPage?.data) ? existingPage.data.filter((entry) => {
    return entry !== null && typeof entry === "object" && "kind" in entry && (entry.kind === "summary" || entry.kind === "categorization")
  }) as Prisma.InputJsonValue[] : []

  await prisma.page.update({
    where: { id: pageId },
    data: {
      title: pageData.title ?? null,
      description: pageData.description ?? null,
      type: pageData.type,
      data: [...pageData.data.filter((entry) => {
        return entry !== null && !(typeof entry === "object" && "kind" in entry && (entry.kind === "summary" || entry.kind === "categorization"))
      }), ...previousAnalysis],
      content: pageData.content ?? null,
      ...(pageData.category !== undefined ? { category: pageData.category } : {}),
      statusCode: pageData.statusCode ?? null,
      lastCrawled: new Date(),
      details: {
        ...existingDetails,
        ...(pageData.details && typeof pageData.details === "object" && !Array.isArray(pageData.details) ? pageData.details : {}),
        crawlResultStatus: pageData.status,
      },
    },
  })
}

// Check whether a crawled URL is the site's homepage.
function isHomepagePageUrl(pageUrl: string): boolean {
  try {
    return new URL(pageUrl).pathname === "/"
  } catch {
    return false
  }
}

// Read the saved rendered HTML from a crawler payload for intelligence analysis.
function getRenderedPageContent(data: unknown): string {
  if (!Array.isArray(data)) return ""
  for (const entry of data) {
    if (entry && typeof entry === "object" && "html" in entry && typeof entry.html === "string") return entry.html
  }
  return ""
}

// Generate and persist fresh page insights before the worker finishes this page job.
async function saveAutomaticPageAnalysis(pageId: string, pageContent: string, onActivity?: (activity: string) => Promise<void>): Promise<void> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { data: true, url: true, title: true, domainId: true, domain: { select: { categories: true } } },
  })
  if (!page) throw new Error(`Page ${pageId} was not found while generating insights.`)

  await onActivity?.(pageFlowActivity["analyzing-page"])
  await updateDomainDetails(page.domainId, {
    currentActivity: `Generating page insight for ${page.url}`,
    currentCrawlUrl: page.url,
  })
  const insight = await generatePageInsight({
    pageUrl: page.url,
    pageTitle: page.title || "",
    pageContent,
    siteCategory: page.domain.categories,
  })

  const currentData = (Array.isArray(page.data) ? page.data.filter((entry) => {
    return entry !== null && !(typeof entry === "object" && "kind" in entry && (entry.kind === "summary" || entry.kind === "categorization"))
  }) : []) as Prisma.InputJsonValue[]
  const addedOn = new Date().toISOString()
  const currentPage = await prisma.page.findUnique({ where: { id: pageId }, select: { details: true } })
  const currentPageDetails = currentPage?.details && typeof currentPage.details === "object" && !Array.isArray(currentPage.details)
    ? currentPage.details as Record<string, unknown>
    : {}
  await prisma.page.update({
    where: { id: pageId },
    data: {
      category: insight.category,
      data: [
        ...currentData,
        { kind: "summary", summary: insight.summary, addedOn },
        { kind: "categorization", category: insight.category, addedOn },
      ],
      details: {
        ...currentPageDetails,
        crawlFlowUpdatedAt: new Date().toISOString(),
      },
      status: "completed-flow",
    },
  })
  await onActivity?.(pageFlowActivity["completed-flow"])
}

// Ensure the site profile exists and save fresh insights before the worker completes this page.
async function completePageCrawlEnrichment(
  pageId: string,
  onActivity?: (activity: string) => Promise<void>,
): Promise<void> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      url: true,
      title: true,
      content: true,
      data: true,
      category: true,
      status: true,
      details: true,
      type: true,
      domainId: true,
      domain: { select: { domain: true, categories: true, details: true } },
    },
  })
  if (!page) throw new Error(`Page ${pageId} was not found after crawling.`)
  const resultStatus = getPageResultStatus(page.status, page.details)
  if (resultStatus !== "Indexed" || page.type !== "text/html" || !page.content?.trim()) {
    await onActivity?.(`Enrichment skipped (${page.status}, ${page.type || "no type"}).`)
    return
  }

  const details = readDetails(page.domain.details)
  await setPageFlowStage(pageId, "analyzing-page")
  await onActivity?.(pageFlowActivity["analyzing-page"])
  const profileExists = !!details.summary || !!details.siteProfileGeneratedAt
  let profileError: Error | undefined
  if (!profileExists) {
    await onActivity?.(pageFlowActivity["analyzing-page"])
    const workerId = `profile-${randomUUID()}`
    const leaseDurationMs = 5 * 60_000
    const deadline = Date.now() + 5 * 60_000
    let acquired = false

    while (Date.now() < deadline) {
      const now = new Date()
      const claim = await prisma.domain.updateMany({
        where: {
          id: page.domainId,
          OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }],
        },
        data: { crawlWorkerId: workerId, crawlLeaseUntil: new Date(now.getTime() + leaseDurationMs) },
      })
      if (claim.count === 1) {
        acquired = true
        break
      }

      const currentDomain = await prisma.domain.findUnique({
        where: { id: page.domainId },
        select: { categories: true, details: true },
      })
      const currentDetails = readDetails(currentDomain?.details)
      if (currentDetails.summary || currentDetails.siteProfileGeneratedAt) break
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }

    if (acquired) {
      const profileHeartbeat = setInterval(() => {
        void prisma.domain.updateMany({
          where: { id: page.domainId, crawlWorkerId: workerId },
          data: { crawlLeaseUntil: new Date(Date.now() + leaseDurationMs) },
        }).catch((error) => console.error(`[site-profile:${page.domainId}] Could not renew profile lease.`, error))
      }, 60_000)

      try {
        const homepage = await prisma.page.findFirst({
          where: { domainId: page.domainId, status: { in: ["Indexed", "completed-flow"] }, type: "text/html" },
          orderBy: { url: "asc" },
          select: { url: true, title: true, content: true, data: true },
        })
        const homepagePage = homepage && isHomepagePageUrl(homepage.url) ? homepage : null
        let homepageName = homepagePage?.title || ""
        let homepageContent = homepagePage?.content || ""
        let renderedContent = getRenderedPageContent(homepagePage?.data)
        let siteUrl = homepagePage?.url || `https://${page.domain.domain}/`

        if (!homepagePage) {
          const response = await withRequestTimeout(fetch(siteUrl, {
            headers: { "User-Agent": neupbotUserAgent },
            cache: "no-store",
            signal: AbortSignal.timeout(intelligenceRequestTimeoutMs),
          }), "Homepage fetch for site profile")
          const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
          if (response.ok && (contentType === "text/html" || contentType === "application/xhtml+xml")) {
            renderedContent = await withRequestTimeout(response.text(), "Homepage response body")
            const $ = cheerio.load(renderedContent)
            homepageName = $("title").text().trim()
            homepageContent = $("body").text().replace(/\s+/g, " ").trim()
            siteUrl = response.url || siteUrl
          }
        }

        if (homepageContent.trim() || renderedContent.trim()) {
          const basics = await getBasics({
            siteId: page.domainId,
            siteUrl,
            homepageName,
            homepageContent,
            renderedContent,
          })
          if (basics) await onActivity?.(pageFlowActivity["analyzing-page"])
          else profileError = new Error("Site profile generation returned no result.")
        } else {
          profileError = new Error("The homepage did not return usable content for a site profile.")
        }
      } catch (error) {
        profileError = error instanceof Error ? error : new Error(String(error))
      } finally {
        clearInterval(profileHeartbeat)
        await prisma.domain.updateMany({
          where: { id: page.domainId, crawlWorkerId: workerId },
          data: { crawlWorkerId: null, crawlLeaseUntil: null },
        })
      }
    }
    if (!acquired) {
      const currentDomain = await prisma.domain.findUnique({ where: { id: page.domainId }, select: { details: true } })
      const currentDetails = readDetails(currentDomain?.details)
      if (currentDetails.summary || currentDetails.siteProfileGeneratedAt) {
        await onActivity?.(pageFlowActivity["analyzing-page"])
      } else {
        profileError = new Error("Could not acquire the site profile lease.")
      }
    }
  } else {
    await onActivity?.(pageFlowActivity["analyzing-page"])
  }

  if (profileError instanceof RequestTimeoutError) {
    await onActivity?.(`${profileError.message} Ignoring; keeping the current stage.`)
    return
  }

  try {
    await saveAutomaticPageAnalysis(pageId, page.content, onActivity)
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      await onActivity?.(`${error.message} Ignoring and continuing.`)
      return
    }
    await onActivity?.("Page insight generation failed")
    await logError({ error, pageId }, "completePageCrawlEnrichment_pageInsight")
    throw error
  }
  if (profileError) await logError({ error: profileError, pageId, siteId: page.domainId }, "completePageCrawlEnrichment_siteProfile")
}

function extractPageLinks($: cheerio.Root): PageLink[] {
  return $("a")
    .map((_: number, el: cheerio.Element): PageLink => ({
      url: $(el).attr("href") || "",
      anchorText: $(el).text(),
      titleText: $(el).attr("title") || undefined,
      rel: $(el).attr("rel") || undefined,
      sourceType: "anchor",
    }))
    .get()
    .filter((link: PageLink) => !!link.url)
}

function extractPageAssets($: cheerio.Root): PageAsset[] {
  const assets: PageAsset[] = []

  $("img[src]").each((_: number, el: cheerio.Element) => {
    assets.push({
      url: $(el).attr("src") || "",
      source: "image",
      kind: "image",
      alt: $(el).attr("alt") || undefined,
      titleText: $(el).attr("title") || undefined,
    })
  })
  $("video[src], video source[src]").each((_: number, el: cheerio.Element) => {
    const video = $(el).is("source") ? $(el).closest("video") : $(el)
    assets.push({
      url: $(el).attr("src") || "",
      source: "video",
      kind: "video",
      titleText: video.attr("title") || video.attr("aria-label") || undefined,
    })
  })
  $("audio[src], audio source[src]").each((_: number, el: cheerio.Element) => {
    const audio = $(el).is("source") ? $(el).closest("audio") : $(el)
    assets.push({
      url: $(el).attr("src") || "",
      source: "audio",
      kind: "audio",
      titleText: audio.attr("title") || audio.attr("aria-label") || undefined,
    })
  })
  $("iframe[src]").each((_: number, el: cheerio.Element) => {
    assets.push({
      url: $(el).attr("src") || "",
      source: "iframe",
      kind: "iframe",
      fileType: "iframe",
      titleText: $(el).attr("title") || $(el).attr("aria-label") || undefined,
    })
  })
  $("script[src], link[href], source[src], embed[src], object[data]").each((_: number, el: cheerio.Element) => {
    const url = $(el).attr("src") || $(el).attr("href") || $(el).attr("data") || ""
    assets.push({
      url,
      source: "asset",
      kind: classifyContentUrl(url)?.kind || "asset",
      fileType: classifyContentUrl(url)?.fileType,
      titleText: $(el).attr("title") || undefined,
      rel: $(el).attr("rel") || undefined,
    })
  })

  return assets.filter((asset) => asset.url)
}

// Store the temporary, compact crawl payload requested for each crawled page.
function buildPageData(
  html: string | null,
  headers: Record<string, string>,
  $: cheerio.Root | null,
  additionalLinks: Array<{ link: string; caption: string }> = [],
): Prisma.InputJsonValue[] {
  if (!$) {
    return [{ html, headers, links: additionalLinks, images: [], videos: [] }]
  }

  const links = [...extractPageLinks($).map((link) => ({
    link: link.url,
    caption: cleanLinkText(link.anchorText) || "",
  })), ...additionalLinks]
  const images = $("img").map((_: number, image: cheerio.Element) => ({
    src: $(image).attr("src") || $(image).attr("data-src") || $(image).attr("data-lazy-src") || "",
    caption: cleanLinkText($(image).attr("alt") || $(image).closest("figure").find("figcaption").first().text()) || "",
  })).get().filter((image: { src: string }) => Boolean(image.src))
  const videos = $("video[src], video source[src]").map((_: number, video: cheerio.Element) => ({
    video: $(video).attr("src") || "",
    caption: cleanLinkText($(video).attr("title") || $(video).closest("video").attr("title") || $(video).closest("video").attr("aria-label")) || "",
  })).get().filter((video: { video: string }) => Boolean(video.video))

  return [{ html, headers, links, images, videos }]
}

type JavaScriptRequirementAssessment = {
  score: number
  wordCount: number
  meaningfulTextLength: number
  paragraphCount: number
  headingCount: number
  imageCount: number
  signals: string[]
}

// Score the HTTP response for signs that meaningful page content requires JavaScript.
function assessJavaScriptRequirement(html: string): JavaScriptRequirementAssessment {
  const $ = cheerio.load(html)
  const mainText = $("main, article, [role='main']").first().text().replace(/\s+/g, " ").trim()
  const rootSelectors = ["#root", "#app", "#__next", "#nuxt"]
  const emptyApplicationRoot = rootSelectors.some((selector) => {
    const root = $(selector).first()
    return root.length > 0 && root.text().replace(/\s+/g, " ").trim().length < 50
  })
  const loadingPlaceholder = $(".loading, .skeleton, .spinner, [class*='loading'], [class*='skeleton'], [class*='spinner']").length > 0 ||
    /\bloading(?:\.\.\.)?\b/i.test($("body").text())
  const noScriptRequiresJavaScript = $("noscript").toArray().some((element) =>
    /(?:requires?\s+javascript|enable\s+javascript|javascript\s+(?:is\s+)?required)/i.test($(element).text()),
  )
  const cleanedDocument = cheerio.load(html)
  cleanedDocument("script, style, noscript, svg, nav, footer, header").remove()
  const meaningfulText = cleanedDocument("body").text().replace(/\s+/g, " ").trim()
  const wordCount = meaningfulText.match(/[\p{L}\p{N}]+/gu)?.length || 0
  const paragraphCount = cleanedDocument("p").filter((_, paragraph) => cleanedDocument(paragraph).text().trim().length > 0).length
  const headingCount = cleanedDocument("h1, h2, h3, h4, h5, h6").filter((_, heading) => cleanedDocument(heading).text().trim().length > 0).length
  const imageCount = cleanedDocument("img").length
  const structuredDataText = $("script[type='application/ld+json']").text()
  const hasStructuredPropertyOrArticleData = /"@type"\s*:\s*(?:\[\s*)?"(?:Article|NewsArticle|BlogPosting|Product|RealEstateListing|Residence|Place)"/i.test(structuredDataText)
  const hasMeaningfulMainContent = wordCount >= 100 || (meaningfulText.length >= 500 && (paragraphCount >= 2 || headingCount >= 2))
  const signals: string[] = []
  let score = 0

  if (mainText.length < 80) {
    score += 40
    signals.push("main-content-empty-or-very-short")
  }
  if (emptyApplicationRoot) {
    score += 25
    signals.push("empty-application-root")
  }
  if (loadingPlaceholder && wordCount < 100) {
    score += 20
    signals.push("loading-placeholder-with-little-content")
  }
  if (wordCount < 50) {
    score += 30
    signals.push("very-low-meaningful-word-count")
  } else if (wordCount < 100) {
    score += 15
    signals.push("low-meaningful-word-count")
  }
  if (noScriptRequiresJavaScript) {
    score += 50
    signals.push("noscript-requires-javascript")
  }
  if (hasStructuredPropertyOrArticleData) {
    score -= 40
    signals.push("structured-property-or-article-data")
  }
  if (hasMeaningfulMainContent) {
    score -= 40
    signals.push("meaningful-content-present")
  }

  return {
    score,
    wordCount,
    meaningfulTextLength: meaningfulText.length,
    paragraphCount,
    headingCount,
    imageCount,
    signals,
  }
}

function matchesContentTarget(content: { kind: ContentKind; fileType: string }, target: { kind?: ContentKind; fileType?: string }) {
  if (target.kind && content.kind !== target.kind) return false
  return !target.fileType || content.fileType === target.fileType
}

export function readContentAssets(data: unknown, sourcePageUrl: string): Array<{ url: string; alt?: string; kind?: ContentKind; fileType?: string }> {
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
        const videoUrl = typeof video === "string"
          ? video
          : video && typeof video === "object" && "video" in video && typeof video.video === "string"
            ? video.video
            : null
        if (!videoUrl) continue
        try {
          assets.push({ url: new URL(videoUrl, sourcePageUrl).toString() })
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

export async function getContentItemById(contentItemId: string): Promise<ContentItem | null> {
  const separatorIndex = contentItemId.indexOf(":")
  if (separatorIndex === -1) return null

  const pageId = contentItemId.slice(0, separatorIndex)
  const contentKey = contentItemId.slice(separatorIndex + 1)

  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        url: true,
        title: true,
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

    if (!page) return null

    const sourcePageTitle = page.title || page.url

    if (contentKey === "direct") {
      const directContent = classifyContentUrl(page.url)
      if (!directContent) return null

      return {
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
    }

    for (const asset of readContentAssets(page.data, page.url)) {
      if (`${page.id}:${asset.url}` !== contentItemId) continue

      const assetContent = asset.kind && asset.fileType
        ? { kind: asset.kind, fileType: asset.fileType }
        : classifyContentUrl(asset.url)
      if (!assetContent) return null

      return {
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
    }

    return null
  } catch (error) {
    await logError({ error, contentItemId }, "getContentItemById")
    return null
  }
}

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
    const absoluteSiteUrl = ensureHttpSiteUrl(siteUrl)
    const robotsTxt = await getRobotsTxt(absoluteSiteUrl)
    const { sitemaps } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [] }
    const sitemapUrls = sitemaps.length > 0 ? sitemaps : [new URL("/sitemap.xml", absoluteSiteUrl).toString()]
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
  rootHostname: string
  disallow: RegExp[]
  sitemapReferencesByUrl: Map<string, Set<string>>
  stats: CrawlResourceStats
  abortIfDomainInactive?: boolean
  onContentSave?: () => Promise<void>
  crawledUrls?: Set<string>
}

async function crawlStoredPage({
  siteId,
  pageId,
  pageUrl,
  rootHostname,
  disallow,
  sitemapReferencesByUrl,
  stats,
  abortIfDomainInactive,
  onContentSave,
  crawledUrls = new Set<string>(),
}: CrawlStoredPageInput) {
  let savingContent = false
  const parsedCurrentUrl = new URL(pageUrl)
  const normalizedUrl = parsedCurrentUrl.origin + parsedCurrentUrl.pathname

  if (crawledUrls.has(normalizedUrl) || disallow.some((regex) => regex.test(parsedCurrentUrl.pathname))) {
    await saveCrawledPage(pageId, {
      title: getUrlTitle(pageUrl),
      description: null,
      type: "skipped",
      data: buildPageData(null, {}, null),
      content: null,
      status: "Skipped",
      statusCode: null,
      details: {
        skippedOn: new Date().toISOString(),
      },
    })
    return false
  }

  try {
    let response = await withRequestTimeout(fetch(pageUrl, {
      headers: { "User-Agent": neupbotUserAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(intelligenceRequestTimeoutMs),
    }), "Page crawl")
    crawledUrls.add(normalizedUrl)

    let fetchedPageUrl = pageUrl
    let contentType = response.headers.get("content-type")
    let redirectLocation = response.headers.get("location")
    if (isHomepagePageUrl(pageUrl) && response.status >= 300 && response.status < 400 && redirectLocation) {
      for (let redirectCount = 0; redirectCount < 10; redirectCount++) {
        const targetUrl = new URL(redirectLocation, fetchedPageUrl)
        if (targetUrl.hostname.toLowerCase() !== rootHostname.toLowerCase()) break
        fetchedPageUrl = targetUrl.toString()
        response = await withRequestTimeout(fetch(fetchedPageUrl, {
          headers: { "User-Agent": neupbotUserAgent },
          redirect: "manual",
          signal: AbortSignal.timeout(intelligenceRequestTimeoutMs),
        }), "Page crawl redirect")
        contentType = response.headers.get("content-type")
        redirectLocation = response.headers.get("location")
        if (response.status < 300 || response.status >= 400 || !redirectLocation) break
      }
    }

    if (response.status >= 300 && response.status < 400) {
      const targetUrl = redirectLocation ? new URL(redirectLocation, fetchedPageUrl).toString() : null
      const data = buildPageData(
        null,
        Object.fromEntries(response.headers.entries()),
        null,
        targetUrl ? [{ link: targetUrl, caption: "Redirect" }] : [],
      )
      await saveCrawledPage(pageId, {
        title: null,
        description: null,
        type: contentType || "redirect",
        data,
        content: null,
        status: "Redirect",
        statusCode: response.status,
        details: {
          contentType,
          redirectLocation: targetUrl,
        },
      })

      if (targetUrl && !isIgnoredCrawlUrl(targetUrl)) {
        const targetPageId = await saveDiscoveredPage({
          siteId,
          url: targetUrl,
          referrer: pageUrl,
          source: "redirect",
          kind: classifyContentUrl(targetUrl)?.kind || "page",
          fileType: classifyContentUrl(targetUrl)?.fileType,
        })
        await saveDiscoveredLink({
          siteId,
          sourceUrl: pageUrl,
          targetUrl,
          sourcePageId: pageId,
          targetPageId,
          sourceType: "redirect",
        })
      }
      return false
    }

    const normalizedContentType = contentType?.split(";")[0].trim().toLowerCase()
    const isHtml = normalizedContentType === "text/html" || normalizedContentType === "application/xhtml+xml"
    if (!response.ok || !isHtml) {
      const fileSize = readContentLength(response.headers)
      const content = classifyContentUrl(pageUrl)
      const data = buildPageData(
        null,
        Object.fromEntries(response.headers.entries()),
        null,
      )
      await saveCrawledPage(pageId, {
        title: getUrlTitle(pageUrl),
        description: null,
        type: contentType || "unknown",
        data,
        content: null,
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

    const html = await withRequestTimeout(response.text(), "Page response body")
    const assessment = assessJavaScriptRequirement(html)
    let pageHtml = html
    let pageHeaders = Object.fromEntries(response.headers.entries())
    let pageDocument = cheerio.load(html)
    const initialDocumentTitle = pageDocument("title").text().trim()
    const shouldRenderWithJavaScript = assessment.score >= 50 || !initialDocumentTitle
    let resolvedPageUrl = response.url || fetchedPageUrl
    let pageStatusCode = response.status
    let javascriptRendered = false

    if (shouldRenderWithJavaScript) {
      try {
        const renderedPage = await withRequestTimeout(crawlPageToHtml(resolvedPageUrl, {
          javascriptEnabled: true,
          userAgent: neupbotUserAgent,
          timeoutMs: intelligenceRequestTimeoutMs,
        }), "Rendered page crawl")
        pageHtml = renderedPage.html
        pageHeaders = renderedPage.headers
        pageDocument = cheerio.load(renderedPage.html)
        resolvedPageUrl = renderedPage.url
        pageStatusCode = renderedPage.statusCode ?? response.status
        javascriptRendered = true
      } catch (renderError) {
        if (renderError instanceof RequestTimeoutError) throw renderError
        await logError({ error: renderError, pageUrl: resolvedPageUrl, assessment }, "crawlSite_jsRenderFallback")
      }
    }

    if (abortIfDomainInactive) {
      const currentDomain = await prisma.domain.findUnique({ where: { id: siteId }, select: { status: true } })
      if (!currentDomain || currentDomain.status !== "Crawling") {
        const currentPage = await prisma.page.findUnique({ where: { id: pageId }, select: { details: true } })
        const currentDetails = currentPage?.details && typeof currentPage.details === "object" && !Array.isArray(currentPage.details)
          ? currentPage.details as Record<string, unknown>
          : {}
        await prisma.page.update({
          where: { id: pageId },
          data: {
            status: "Skipped",
            content: null,
            lastCrawled: new Date(),
            details: { ...currentDetails, crawlResultStatus: "Skipped", skipReason: "domain-crawl-cancelled" },
          },
        })
        return false
      }
    }

    const markdown = extractMarkdownFromHtml(pageHtml, resolvedPageUrl)
    const pageTitle = markdown.title || pageDocument("title").text() || pageDocument("h1").first().text()
    const pageContent = markdown.markdown
    const data = buildPageData(pageHtml, pageHeaders, pageDocument)

    savingContent = true
    await onContentSave?.()
    await saveCrawledPage(pageId, {
      title: pageTitle || null,
      description: pageDocument("meta[name=\"description\"]").attr("content") || pageDocument("meta[property=\"og:description\"]").attr("content") || null,
      type: "text/html",
      data,
      content: pageContent,
      status: "Indexed",
      statusCode: pageStatusCode,
      details: {
        contentType,
        ...(fetchedPageUrl !== pageUrl ? { redirectedFrom: pageUrl, resolvedUrl: fetchedPageUrl } : {}),
        javascriptRendering: {
          attempted: shouldRenderWithJavaScript,
          used: javascriptRendered,
          score: assessment.score,
          signals: assessment.signals,
          metrics: {
            wordCount: assessment.wordCount,
            meaningfulTextLength: assessment.meaningfulTextLength,
            paragraphCount: assessment.paragraphCount,
            headingCount: assessment.headingCount,
            imageCount: assessment.imageCount,
          },
        },
      },
    })
    savingContent = false

    await saveDiscoveredLinksAndPages(siteId, resolvedPageUrl, extractPageLinks(pageDocument), sitemapReferencesByUrl, rootHostname, stats, pageId)
    await saveDiscoveredAssets(siteId, resolvedPageUrl, extractPageAssets(pageDocument), sitemapReferencesByUrl, rootHostname, stats, pageId)
    return true
  } catch (fetchError) {
    if (fetchError instanceof RequestTimeoutError || (fetchError instanceof Error && fetchError.name === "TimeoutError")) {
      throw fetchError instanceof RequestTimeoutError
        ? fetchError
        : new RequestTimeoutError("Page crawl")
    }
    await logError({ error: fetchError, currentUrl: pageUrl }, "crawlSite_fetch")
    if (savingContent) throw fetchError
    await saveCrawledPage(pageId, {
      title: getUrlTitle(pageUrl),
      description: null,
      type: "fetch-error",
      data: buildPageData(null, {}, null),
      content: null,
      status: "Error",
      statusCode: null,
      details: {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      },
    })
    return false
  }
}

export async function runPageCrawler(
  pageId: string,
  options: {
    updateDomainProgress?: boolean
    leaseAlreadyClaimed?: boolean
    generateInsights?: boolean
    onActivity?: (activity: string) => Promise<void>
  } = {},
) {
  // Persist the shared lifecycle stages for both queued and manually requested crawls.
  let activeStage: PageFlowStage = "discovered-page"
  const reportPageFlowStage = async (stage: PageFlowStage) => {
    activeStage = stage
    await setPageFlowStage(pageId, stage)
    if (stage !== "reported-errors") await options.onActivity?.(pageFlowActivity[stage])
  }

  const runTrackedPageFlow = async (crawl: () => Promise<unknown>): Promise<boolean> => {
    try {
      await reportPageFlowStage("discovered-page")
      await reportPageFlowStage("crawling-page")
      await withRequestTimeout(crawl(), "Page crawl")
      const page = await prisma.page.findUnique({ where: { id: pageId }, select: { status: true, details: true } })
      const resultStatus = page ? getPageResultStatus(page.status, page.details) : "Error"
      if (resultStatus === "Error" || resultStatus === "Skipped" || resultStatus === "Redirect") {
        await prisma.page.update({ where: { id: pageId }, data: { status: resultStatus === "Error" ? "Error" : "Skipped" } })
        await options.onActivity?.("Skipping")
        return false
      }

      await getPageIssues(pageId)
      await reportPageFlowStage("reported-errors")
      if (resultStatus === "Indexed" && options.generateInsights !== false) {
        activeStage = "analyzing-page"
        await completePageCrawlEnrichment(pageId, options.onActivity)
      }
      return resultStatus === "Indexed"
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        await options.onActivity?.(`${error.message} Ignoring; keeping the current stage.`)
        return false
      }
      const currentPage = await prisma.page.findUnique({ where: { id: pageId }, select: { status: true, details: true } })
      const currentDetails = currentPage?.details && typeof currentPage.details === "object" && !Array.isArray(currentPage.details)
        ? currentPage.details as Record<string, unknown>
        : {}
      await prisma.page.update({
        where: { id: pageId },
        data: {
          status: "Error",
          details: {
            ...currentDetails,
            failedFlowStage: currentPage?.status || activeStage,
            crawlError: error instanceof Error ? error.message : String(error),
            crawlFlowUpdatedAt: new Date().toISOString(),
          },
        },
      })
      const failureStage = currentPage?.status === "analyzing-page" || activeStage === "analyzing-page"
        ? "Generating Insights (failed)"
        : currentPage?.status === "saved-content" || activeStage === "saved-content"
          ? "Saving Content (failed)"
          : "Skipping"
      await options.onActivity?.(failureStage)
      throw error
    }
  }

  const crawlCurrentPage = () => crawlPage(pageId, {
    updateDomainProgress: options.updateDomainProgress,
    abortIfDomainInactive: options.leaseAlreadyClaimed,
    onContentSave: () => reportPageFlowStage("saved-content"),
  })

  if (options.leaseAlreadyClaimed) {
    await runTrackedPageFlow(crawlCurrentPage)
    return
  }

  const workerId = `manual-${randomUUID()}`
  const now = new Date()
  const claim = await prisma.page.updateMany({
    where: {
      id: pageId,
      OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: now } }],
    },
    data: {
      crawlWorkerId: workerId,
      crawlLeaseUntil: new Date(now.getTime() + 15 * 60_000),
    },
  })
  if (claim.count !== 1) throw new Error("This page is already being crawled.")
  const heartbeat = setInterval(() => {
    void prisma.page.updateMany({
      where: { id: pageId, crawlWorkerId: workerId },
      data: { crawlLeaseUntil: new Date(Date.now() + 15 * 60_000) },
    }).catch((error) => console.error(`[manual-page-crawl:${pageId}] Could not renew page lease.`, error))
  }, 60_000)

  try {
    await runTrackedPageFlow(crawlCurrentPage)
  } finally {
    clearInterval(heartbeat)
    await prisma.page.updateMany({
      where: { id: pageId, crawlWorkerId: workerId },
      data: { crawlWorkerId: null, crawlLeaseUntil: null },
    })
    const page = await prisma.page.findUnique({ where: { id: pageId }, select: { domainId: true } })
    if (page) await completeDomainCrawlIfIdle(page.domainId)
  }
}

// Fetch and persist one page whose lease has already been claimed.
async function crawlPage(pageId: string, options: { updateDomainProgress?: boolean; abortIfDomainInactive?: boolean; onContentSave?: () => Promise<void> }) {
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
  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }
  const siteOrigin = `https://${page.domain.domain}`
  const robotsTxt = await getRobotsTxt(siteOrigin)
  const { disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { disallow: [] }

  for (const reference of await findSitemapReferencesForUrl(page.url, siteOrigin)) {
    addSitemapReference(sitemapReferencesByUrl, page.url, reference.sitemapUrl)
  }

  if (options.updateDomainProgress !== false) {
    await updateDomainDetails(page.domainId, {
      currentActivity: `Crawling ${page.url}`,
      currentCrawlUrl: page.url,
    })
  }

  await crawlStoredPage({
    siteId: page.domainId,
    pageId: page.id,
    pageUrl: page.url,
    rootHostname: page.domain.domain,
    disallow,
    sitemapReferencesByUrl,
    stats,
    abortIfDomainInactive: options.abortIfDomainInactive,
    onContentSave: options.onContentSave,
  })

  const pageCrawlTime = new Date()
  if (options.updateDomainProgress === false) {
    await prisma.domain.update({ where: { id: page.domainId }, data: { lastCrawled: pageCrawlTime } })
  } else {
    await prisma.domain.update({
      where: { id: page.domainId },
      data: {
        lastCrawled: pageCrawlTime,
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: page.domainId }, select: { details: true } }))?.details),
          currentActivity: "Page crawl complete.",
          currentCrawlUrl: "",
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
        },
      },
    })
  }
}

// Build the root URL used for a site's first crawl.
function getSiteHomepageUrl(siteUrl: string): string {
  const homepageUrl = new URL(siteUrl)
  homepageUrl.pathname = "/"
  homepageUrl.search = ""
  homepageUrl.hash = ""
  return homepageUrl.toString()
}

// Crawl the homepage first for a new site, save its basics, then crawl the requested page.
export async function runSinglePageCrawler(siteId: string, pageUrl: string) {
  if (!siteId || !pageUrl) {
    throw new Error("siteId and pageUrl are required.")
  }

  const domain = await prisma.domain.findUnique({
    where: { id: siteId },
    select: { id: true, domain: true, details: true, lastCrawled: true },
  })
  if (!domain) throw new Error("Domain not found.")

  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }
  let pagesCrawled = 0
  let pageId: string | undefined
  const isFirstCrawl = domain.lastCrawled === null
  const homepageUrl = getSiteHomepageUrl(pageUrl)

  if (isFirstCrawl) {
    const homepagePageId = await saveDiscoveredPage({ siteId, url: homepageUrl, source: "seed", kind: "page" })
    if (homepagePageId) {
      await updateDomainDetails(siteId, {
        currentActivity: `Crawling homepage ${homepageUrl}`,
        currentCrawlUrl: homepageUrl,
      })
      await runPageCrawler(homepagePageId, { updateDomainProgress: false })
      const homepageCrawl = await prisma.page.findUnique({ where: { id: homepagePageId }, select: { status: true, details: true } })
      if (homepageCrawl && getPageResultStatus(homepageCrawl.status, homepageCrawl.details) === "Indexed") pagesCrawled++
      if (isHomepagePageUrl(pageUrl) && !new URL(pageUrl).search) pageId = homepagePageId
    }
  }

  if (!pageId) {
    pageId = await saveDiscoveredPage({ siteId, url: pageUrl, source: "seed", kind: "page" })
    if (!pageId) throw new Error("The requested URL cannot be crawled.")
    await updateDomainDetails(siteId, {
      currentActivity: `Crawling ${pageUrl}`,
      currentCrawlUrl: pageUrl,
    })
    await runPageCrawler(pageId, { updateDomainProgress: false })
    const requestedPageCrawl = await prisma.page.findUnique({ where: { id: pageId }, select: { status: true, details: true } })
    if (requestedPageCrawl && getPageResultStatus(requestedPageCrawl.status, requestedPageCrawl.details) === "Indexed") pagesCrawled++
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, url: true, title: true, status: true, statusCode: true, lastCrawled: true, data: true },
  })
  await prisma.domain.update({
    where: { id: siteId },
    data: {
      status: page?.status === "Error" ? "Error" : "Active",
      lastCrawled: new Date(),
      details: {
        ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
        currentActivity: "Single page crawl complete.",
        currentCrawlUrl: "",
        pagesCrawled,
        internalResourcesFound: stats.internalResourcesFound,
        externalResourcesFound: stats.externalResourcesFound,
      },
    },
  })

  return page
}

// Queue an existing domain for background crawling, optionally marking all its pages for refresh.
export async function queueDomainCrawl(siteId: string, refreshExistingPages = false): Promise<void> {
  if (!siteId) throw new Error("siteId is required.")

  await prisma.$transaction(async (transaction) => {
    const domain = await transaction.domain.findUnique({
      where: { id: siteId },
      select: { status: true, details: true, crawlLeaseUntil: true },
    })
    if (!domain) throw new Error("Domain not found.")
    if (domain.status === "Crawling" || (domain.crawlLeaseUntil && domain.crawlLeaseUntil > new Date())) {
      throw new Error("This domain is already being crawled.")
    }

    if (refreshExistingPages) {
      await transaction.page.updateMany({
        where: {
          domainId: siteId,
          OR: [{ crawlLeaseUntil: null }, { crawlLeaseUntil: { lte: new Date() } }],
        },
        data: { status: "Pending", crawlWorkerId: null, crawlLeaseUntil: null },
      })
      await transaction.page.updateMany({
        where: { domainId: siteId, crawlLeaseUntil: { gt: new Date() } },
        data: { status: "Pending" },
      })
    }

    await transaction.domain.update({
      where: { id: siteId },
      data: {
        status: "Requested",
        crawlWorkerId: null,
        crawlLeaseUntil: null,
        details: {
          ...readDetails(domain.details),
          currentActivity: "Queued for background crawl.",
          currentCrawlUrl: "",
        },
      },
    })
  })
}

// Requeue pending pages for workers instead of crawling them inside the request process.
export async function resumePendingCrawler(siteId: string) {
  await queueDomainCrawl(siteId)
}

// Prepare a site's discovery queue so independent page workers can crawl it concurrently.
export async function prepareCrawler(siteId: string, siteUrl: string) {
  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  const sitemapReferencesByUrl = new Map<string, Set<string>>()
  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }

  try {
    const initialDomain = await prisma.domain.findUnique({
      where: { id: siteId },
      select: { lastCrawled: true, details: true },
    })
    if (!initialDomain) throw new Error("Domain not found.")
    const isFirstCrawl = initialDomain.lastCrawled === null
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        details: {
          ...readDetails(initialDomain.details),
          currentActivity: "Fetching robots.txt...",
          currentCrawlUrl: "",
          crawlStartedAt: new Date().toISOString(),
          pagesCrawled: 0,
          internalResourcesFound: 0,
          externalResourcesFound: 0,
        },
      },
    })

    const robotsTxt = await getRobotsTxt(siteUrl)
    const { sitemaps } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] }
    const robotsUrl = new URL("/robots.txt", siteUrl).toString()

    if (isFirstCrawl) {
      const homepageUrl = getSiteHomepageUrl(siteUrl)
      await saveDiscoveredPage({ siteId, url: homepageUrl, source: "seed", kind: "page" })
    }

    if (sitemaps.length > 0) {
      await updateDomainDetails(siteId, { currentActivity: `Found ${sitemaps.length} sitemaps. Parsing...` })
      for (const sitemapUrl of sitemaps) {
        const entries = await getSitemapUrlEntries(sitemapUrl, { siteId, referrer: robotsUrl })
        await saveSitemapPages(siteId, entries, sitemapReferencesByUrl, getDomainName(siteUrl), stats)
      }
    } else {
      const sitemapEntries = await getSitemapUrlEntries(new URL("/sitemap.xml", siteUrl).toString(), {
        siteId,
        referrer: siteUrl,
      })
      if (sitemapEntries.length > 0) {
        await updateDomainDetails(siteId, { currentActivity: "Found default sitemap.xml. Parsing..." })
        await saveSitemapPages(siteId, sitemapEntries, sitemapReferencesByUrl, getDomainName(siteUrl), stats)
      }
    }

    if (!isFirstCrawl) {
      await saveDiscoveredPage({ siteId, url: siteUrl, source: "seed", kind: "page" })
    }

    await updateDomainDetails(siteId, {
      currentActivity: "Crawling discovered pages...",
      currentCrawlUrl: "",
      pagesCrawled: 0,
      internalResourcesFound: stats.internalResourcesFound,
      externalResourcesFound: stats.externalResourcesFound,
    })
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Crawling",
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

// Mark a site complete only when no queued page or active page lease remains.
export async function completeDomainCrawlIfIdle(siteId: string): Promise<boolean> {
  const now = new Date()
  const [pendingPages, activePageLeases, domain] = await Promise.all([
    prisma.page.count({ where: { domainId: siteId, status: "Pending" } }),
    prisma.page.count({ where: { domainId: siteId, crawlLeaseUntil: { gt: now } } }),
    prisma.domain.findUnique({ where: { id: siteId }, select: { status: true, details: true } }),
  ])

  if (!domain || domain.status !== "Crawling" || pendingPages > 0 || activePageLeases > 0) return false
  const details = readDetails(domain.details)
  const crawlStartedAt = details.crawlStartedAt ? new Date(details.crawlStartedAt) : null
  const pagesCrawled = crawlStartedAt && !Number.isNaN(crawlStartedAt.getTime())
    ? await prisma.page.count({ where: { domainId: siteId, lastCrawled: { gte: crawlStartedAt } } })
    : 0

  const result = await prisma.domain.updateMany({
    where: { id: siteId, status: "Crawling" },
    data: {
      status: "Active",
      lastCrawled: now,
      details: {
        ...details,
        pagesCrawled,
        currentActivity: "Crawl complete.",
        currentCrawlUrl: "",
      },
    },
  })

  return result.count === 1
}

// Return workers whose heartbeat shows that their process is still alive.
export async function getLiveNeupbotWorkers() {
  const heartbeatCutoff = new Date(Date.now() - 30_000)
  const workers = await prisma.crawlerWorker.findMany({
    where: { lastSeenAt: { gte: heartbeatCutoff }, status: { not: "Stopped" } },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      status: true,
      activity: true,
      siteId: true,
      siteUrl: true,
      currentUrl: true,
      lastSeenAt: true,
    },
  })

  const workersWithPageIds = await Promise.all(workers.map(async (worker) => {
    if (!worker.siteId || !worker.currentUrl) return { ...worker, pageId: null }
    const page = await prisma.page.findFirst({
      where: { domainId: worker.siteId, url: worker.currentUrl },
      select: { id: true },
    })
    return { ...worker, pageId: page?.id || null }
  }))

  return workersWithPageIds
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
    status: page.status,
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.addedOn,
    content: page.content || undefined,
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
  const heartbeatCutoff = new Date(Date.now() - 30_000)
  const [totalSites, totalPages, activeCrawls, crawlErrors] = await Promise.all([
    prisma.domain.count(),
    prisma.page.count(),
    prisma.crawlerWorker.count({
      where: {
        status: "Working",
        siteId: { not: null },
        currentUrl: { not: null },
        lastSeenAt: { gte: heartbeatCutoff },
      },
    }),
    prisma.domain.count({ where: { status: "Error" } }),
  ])
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
  const domain = await prisma.domain.findUnique({
    where: { id: siteId },
    select: { details: true },
  })

  await prisma.$transaction(async (tx) => {
    const pages = await tx.page.findMany({
      where: { domainId: siteId },
      select: { id: true },
    })
    const pageIds = pages.map((page) => page.id)

    await tx.link.deleteMany({
      where: {
        OR: [
          { fromDomain: siteId },
          { toDomain: siteId },
          ...(pageIds.length > 0
            ? [
                { sourcePageId: { in: pageIds } },
                { targetPageId: { in: pageIds } },
              ]
            : []),
        ],
      },
    })
    await tx.page.deleteMany({ where: { domainId: siteId } })
    await tx.domain.update({
      where: { id: siteId },
      data: {
        lastCrawled: null,
        details: {
          ...readDetails(domain?.details),
          pagesCrawled: 0,
          internalResourcesFound: 0,
          externalResourcesFound: 0,
          currentActivity: "Pages deleted by user.",
          currentCrawlUrl: null,
          currentlyCrawling: null,
        },
      },
    })
  })
}

export async function deleteManagedDomain(siteId: string) {
  await prisma.domain.delete({ where: { id: siteId } })
}

export async function deleteManagedPage(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, url: true, domainId: true },
  })

  if (!page) return null

  await prisma.$transaction([
    prisma.link.deleteMany({
      where: {
        OR: [
          { sourcePageId: page.id },
          { targetPageId: page.id },
          { linkFrom: page.url },
          { linkTo: page.url },
        ],
      },
    }),
    prisma.page.delete({ where: { id: page.id } }),
  ])

  return { siteId: page.domainId }
}

export async function getAllCrawlTargets() {
  return prisma.domain.findMany({
    orderBy: { addedOn: "desc" },
    select: { id: true, domain: true },
  })
}

export function readRedirectTarget(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const redirectEntry = data.find((entry) => {
    return entry && typeof entry === "object" && "links" in entry && Array.isArray(entry.links)
  })
  if (!redirectEntry || typeof redirectEntry !== "object" || !("links" in redirectEntry) || !Array.isArray(redirectEntry.links)) return undefined
  const redirectLink = redirectEntry.links.find((link) => link && typeof link === "object" && "caption" in link && link.caption === "Redirect" && "link" in link)
  return redirectLink && typeof redirectLink === "object" && "link" in redirectLink && typeof redirectLink.link === "string"
    ? redirectLink.link
    : undefined
}

function readPageBodyHtml(data: unknown) {
  if (!Array.isArray(data)) return null

  for (const entry of data) {
    if (entry && typeof entry === "object" && "html" in entry && typeof entry.html === "string") {
      return entry.html
    }
    if (entry && typeof entry === "object" && "bodyHtml" in entry && typeof entry.bodyHtml === "string") {
      return entry.bodyHtml
    }
  }

  return null
}

function isManageLinkPlaceholderValue(input: string) {
  const normalizedInput = input.trim().toLowerCase()

  return (
    normalizedInput.length === 0 ||
    normalizedInput === "#" ||
    normalizedInput === "/" ||
    normalizedInput === "null" ||
    normalizedInput === "undefined" ||
    normalizedInput === "void(0)" ||
    normalizedInput === "javascript:void(0)" ||
    normalizedInput === "javascript:void(0);" ||
    normalizedInput === "javascript:;" ||
    normalizedInput.startsWith("javascript:") ||
    normalizedInput.startsWith("data:")
  )
}

function normalizeManagedLinkTarget(input: string, baseUrl: string) {
  const trimmedInput = input.trim()
  const normalizedInput = trimmedInput.toLowerCase()

  if (normalizedInput.startsWith("mailto:") || normalizedInput.startsWith("tel:")) {
    return trimmedInput
  }

  try {
    const url = new URL(trimmedInput, baseUrl)
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

function classifyManagedLinkType(sourceDomain: string, targetUrl: string): Exclude<ManagedLinkType, "incoming"> | null {
  const normalizedTargetUrl = targetUrl.toLowerCase()
  if (normalizedTargetUrl.startsWith("mailto:")) return "mailto"
  if (normalizedTargetUrl.startsWith("tel:")) return "tel"

  try {
    return getPropertyAddress(targetUrl) === sourceDomain ? "internal" : "outgoing"
  } catch {
    return null
  }
}

function matchesManagedLinkSearch(link: ManagedLinkItem, search?: string) {
  if (!search) return true

  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [
    link.sourcePageTitle,
    link.sourceUrl,
    link.targetUrl,
    link.sourceDomain,
    link.targetDomain || "",
    link.anchorText || "",
    link.titleText || "",
    link.rel || "",
  ].some((value) => value.toLowerCase().includes(normalizedSearch))
}

export async function getManagedLinks(input?: {
  propertyId?: string
  type?: ManagedLinkType
  page?: number
  pageSize?: number
  search?: string
}): Promise<PaginatedManagedLinks> {
  const requestedPage = input?.page && input.page > 0 ? input.page : 1
  const pageSize = input?.pageSize && input.pageSize > 0 ? input.pageSize : 20

  try {
    const propertyDomain = input?.propertyId
      ? await prisma.domain.findUnique({
          where: { id: input.propertyId },
          select: { domain: true },
        })
      : null
    const pages = await prisma.page.findMany({
      where: input?.propertyId
        ? input.type === "incoming"
          ? { NOT: { domainId: input.propertyId } }
          : { domainId: input.propertyId }
        : undefined,
      orderBy: [
        { lastCrawled: "desc" },
        { addedOn: "desc" },
      ],
      select: {
        id: true,
        title: true,
        url: true,
        addedOn: true,
        lastCrawled: true,
        data: true,
        domain: {
          select: {
            domain: true,
          },
        },
      },
    })

    const links: ManagedLinkItem[] = []
    const seen = new Set<string>()

    for (const page of pages) {
      const bodyHtml = readPageBodyHtml(page.data)
      if (!bodyHtml) continue

      const $ = cheerio.load(bodyHtml)
      $("a[href]").each((index: number, el: cheerio.Element) => {
        const rawHref = $(el).attr("href") || ""
        if (isManageLinkPlaceholderValue(rawHref)) return

        const targetUrl = normalizeManagedLinkTarget(rawHref, page.url)
        if (!targetUrl) return

        const type = classifyManagedLinkType(page.domain.domain, targetUrl)
        if (!type) return
        const targetDomain = type === "internal" || type === "outgoing"
          ? getPropertyAddress(targetUrl)
          : undefined

        const resolvedType: ManagedLinkType = input?.propertyId &&
          propertyDomain &&
          page.domain.domain !== propertyDomain.domain &&
          targetDomain === propertyDomain.domain
          ? "incoming"
          : type

        if (input?.type) {
          if (input.type === "incoming") {
            if (resolvedType !== "incoming") return
          } else if (resolvedType !== input.type) {
            return
          }
        } else if (resolvedType === "incoming") {
          return
        }

        const anchorText = cleanLinkText($(el).text())
        const titleText = $(el).attr("title") || undefined
        const rel = $(el).attr("rel") || undefined
        const linkId = `${page.id}:${resolvedType}:${targetUrl}:${index}`
        const dedupeKey = `${page.id}:${resolvedType}:${targetUrl}:${anchorText || ""}:${titleText || ""}`

        if (seen.has(dedupeKey)) return
        seen.add(dedupeKey)

        const link: ManagedLinkItem = {
          id: linkId,
          type: resolvedType,
          sourcePageId: page.id,
          sourcePageTitle: page.title || page.url,
          sourceUrl: page.url,
          sourceDomain: page.domain.domain,
          targetUrl,
          targetDomain,
          anchorText,
          titleText,
          rel,
          firstCrawlOn: page.lastCrawled || page.addedOn,
        }

        if (matchesManagedLinkSearch(link, input?.search)) {
          links.push(link)
        }
      })
    }

    links.sort((left, right) => right.firstCrawlOn.getTime() - left.firstCrawlOn.getTime())

    const totalCount = links.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const page = Math.min(requestedPage, totalPages)
    const start = (page - 1) * pageSize

    return {
      links: links.slice(start, start + pageSize),
      page,
      pageSize,
      totalCount,
      totalPages,
    }
  } catch (error) {
    await logError({ error, input }, "getManagedLinks")
    return {
      links: [],
      page: requestedPage,
      pageSize,
      totalCount: 0,
      totalPages: 1,
    }
  }
}

function hasCrawlError(page: { status: string; statusCode: number | null; details?: unknown }) {
  return (page.statusCode !== null && page.statusCode >= 400)
    || page.status === "Error"
    || getPageResultStatus(page.status, page.details) === "Error"
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
        details: true,
        type: true,
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
        status: getPageResultStatus(targetPage.status, targetPage.details),
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
        status: getPageResultStatus(targetPage.status, targetPage.details),
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
        { details: { path: ["crawlResultStatus"], equals: "Skipped" } },
        { details: { path: ["crawlResultStatus"], equals: "Redirect" } },
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
      status: getPageResultStatus(page.status, page.details),
      statusCode: page.statusCode,
      type: isRedirect ? "Redirect" : isError ? "Error" : "Skipped",
      targetUrl: readRedirectTarget(page.data),
      lastCrawled: page.lastCrawled,
      addedOn: page.addedOn,
    }
  })
}
