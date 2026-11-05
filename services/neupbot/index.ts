import * as cheerio from "cheerio"
import { isIP } from "node:net"
import { chromium, type Page as PlaywrightPage } from "playwright"
import type { Prisma } from "@prisma/client"
import { summarizeSite } from "@/ai/flows/summarize-site-flow"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import { getFavicon } from "../properties/getFavicon"

export const neupbotUserAgent = "NeupBot/1.0 (+https://neupgroup.com/neupbot; crawler.neupbot@neupgroup.com)"

export type DomainDetails = {
  description?: string
  summary?: string
  logoUrl?: string
  appIconUrl?: string
  appIconBackgroundColor?: string
  discoveredFrom?: string
  locations?: string[]
  currentActivity?: string
  currentCrawlUrl?: string
  pagesCrawled?: number
  internalResourcesFound?: number
  externalResourcesFound?: number
}

export type ManagedDomain = {
  id: string
  url: string
  description: string
  status: "Pending" | "Active" | "Paused" | "Error" | "Crawling"
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

export type NeupbotCrawlActivity = {
  siteId: string
  siteUrl: string
  siteName?: string
  status: ManagedDomain["status"]
  currentActivity?: string
  currentCrawlUrl?: string
  pagesCrawled: number
  internalResourcesFound: number
  externalResourcesFound: number
  lastCrawled: string | null
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
  if (url.pathname === "/") {
    url.pathname = ""
  }
  return url.toString()
}

export function getDomainId(input: string) {
  return getPropertyAddress(input)
}

export function getPropertyAddress(input: string) {
  return new URL(input).hostname.toLowerCase().replace(/\.$/, "")
}

export function isValidDomainHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")

  if (
    !normalizedHostname ||
    normalizedHostname.length > 253 ||
    normalizedHostname.includes("..") ||
    normalizedHostname === "localhost"
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
  const hostname = getPropertyAddress(input)
  if (!(isIP(hostname) || isValidDomainHostname(hostname))) {
    throw new InvalidDomainError()
  }
}

export function getDomainName(input: string) {
  return new URL(input).hostname
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

async function readStaticFileSize(response: Response) {
  const headerSize = readContentLength(response.headers)
  if (headerSize !== null) return headerSize

  try {
    return (await response.arrayBuffer()).byteLength
  } catch {
    return null
  }
}

type ClickResolvedLink = {
  targetUrl: string
  anchorText?: string
  titleText?: string
  rel?: string
}

async function discoverClientSideNavigationLinks(
  renderedPage: PlaywrightPage,
  currentUrl: string,
) {
  const candidates = await renderedPage.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map((anchor, index) => ({
        index,
        href: anchor.getAttribute("href") || "",
        anchorText: anchor.textContent || "",
        titleText: anchor.getAttribute("title") || "",
        rel: anchor.getAttribute("rel") || "",
      }))
      .filter((candidate) => {
        const normalizedHref = candidate.href.trim().toLowerCase()
        return (
          normalizedHref === "#" ||
          normalizedHref === "null" ||
          normalizedHref === "undefined" ||
          normalizedHref === "void(0)" ||
          normalizedHref === "javascript:void(0)" ||
          normalizedHref === "javascript:void(0);" ||
          normalizedHref === "javascript:;" ||
          normalizedHref.startsWith("javascript:")
        )
      })
  })

  const resolvedLinks: ClickResolvedLink[] = []
  const seenTargetUrls = new Set<string>()

  for (const candidate of candidates) {
    try {
      await renderedPage.goto(currentUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      await renderedPage.waitForTimeout(500)

      const locator = renderedPage.locator("a").nth(candidate.index)
      if (await locator.count() === 0) continue

      const navigationPromise = renderedPage.waitForURL(
        (url: URL) => buildCrawlUrlKey(url.toString()) !== buildCrawlUrlKey(currentUrl),
        { timeout: 4000 },
      ).then(() => renderedPage.url()).catch(() => null)

      await locator.click({ timeout: 4000 }).catch(() => null)
      const targetUrl = await navigationPromise
      if (!targetUrl) continue

      const normalizedTargetUrl = normalizeSiteUrl(targetUrl)
      const targetUrlKey = buildCrawlUrlKey(normalizedTargetUrl)
      if (seenTargetUrls.has(targetUrlKey) || isIgnoredCrawlUrl(normalizedTargetUrl)) {
        continue
      }

      seenTargetUrls.add(targetUrlKey)
      resolvedLinks.push({
        targetUrl: normalizedTargetUrl,
        anchorText: cleanLinkText(candidate.anchorText),
        titleText: cleanLinkText(candidate.titleText),
        rel: cleanLinkText(candidate.rel),
      })
    } catch {
    }
  }

  if (candidates.length > 0) {
    await renderedPage.goto(currentUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }).catch(() => null)
  }

  return resolvedLinks
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
    status: "Pending",
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

async function getNextPendingPage(siteId: string) {
  const pendingPages = await prisma.page.findMany({
    where: { domainId: siteId, status: "Pending" },
    orderBy: { addedOn: "asc" },
    take: 50,
    select: { id: true, url: true },
  })

  for (const page of pendingPages) {
    if (!isIgnoredCrawlUrl(page.url)) return page

    await prisma.page.update({
      where: { id: page.id },
      data: {
        status: "Skipped",
        details: {
          ignoredReason: "Ignored Next.js generated asset.",
        },
      },
    })
  }

  return null
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

export function readDetails(details: unknown): DomainDetails {
  return details && typeof details === "object" && !Array.isArray(details) ? details as DomainDetails : {}
}

function mergeLocations(existingLocations: string[] | undefined, nextLocation: string) {
  const normalizedExistingLocations = Array.isArray(existingLocations)
    ? existingLocations.filter((location): location is string => typeof location === "string" && location.length > 0)
    : []

  return normalizedExistingLocations.includes(nextLocation)
    ? normalizedExistingLocations
    : [nextLocation, ...normalizedExistingLocations]
}

function getPrimaryLocation(details: DomainDetails, propertyAddress: string) {
  const primaryLocation = Array.isArray(details.locations) ? details.locations[0] : undefined
  return primaryLocation || `https://${propertyAddress}`
}

async function resolveManagedDomainBranding(propertyAddress: string, currentBackgroundColor?: string) {
  return getFavicon(propertyAddress, {
    currentBackgroundColor,
    userAgent: neupbotUserAgent,
  })
}

async function enrichManagedDomainBranding(site: ManagedDomain): Promise<ManagedDomain> {
  const branding = await resolveManagedDomainBranding(site.id, site.appIconBackgroundColor)

  return {
    ...site,
    appIconUrl: branding.appIconUrl,
    appIconBackgroundColor: branding.appIconBackgroundColor,
  }
}

async function upsertDomainRecord(input: {
  url: string
  name: string
  status: string
  details?: DomainDetails
}) {
  const siteUrl = normalizeSiteUrl(input.url)
  const propertyAddress = getPropertyAddress(siteUrl)
  assertValidSiteDomain(siteUrl)

  const existing = await prisma.domain.findUnique({
    where: { domain: propertyAddress },
    select: {
      id: true,
      name: true,
      details: true,
    },
  })

  const existingDetails = readDetails(existing?.details)
  const mergedDetails: DomainDetails = {
    ...existingDetails,
    ...input.details,
    locations: mergeLocations(existingDetails.locations, siteUrl),
  }

  const domain = existing
    ? await prisma.domain.update({
        where: { id: existing.id },
        data: {
          name: existing.name || input.name,
          details: mergedDetails,
        },
      })
    : await prisma.domain.create({
        data: {
          id: propertyAddress,
          domain: propertyAddress,
          name: input.name,
          status: input.status,
          details: mergedDetails,
        },
      })

  return { domain, siteUrl, propertyAddress }
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
    url: getPrimaryLocation(details, domain.domain),
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

export async function createDomainForCrawl(input: { url: string; description?: string }) {
  const { domain, siteUrl } = await upsertDomainRecord({
    url: input.url,
    name: getPropertyAddress(input.url),
    status: "Pending",
    details: {
      description: input.description || "",
      currentActivity: "Queued for crawl.",
      pagesCrawled: 0,
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
  const sites = await Promise.all(slice.map(async (domain) => enrichManagedDomainBranding(mapDomainToSite(domain))))

  return {
    sites,
    lastVisibleId: (search ? rows.length > Math.max(startIndex, 0) + take : sites.length === take)
      ? sites[sites.length - 1]?.id || null
      : null,
  }
}

export async function getPropertyOptions(search?: string): Promise<ManagedDomain[]> {
  const trimmedSearch = search?.trim()
  const domains = await prisma.domain.findMany({
    where: trimmedSearch
      ? {
          OR: [
            { domain: { contains: trimmedSearch, mode: "insensitive" as const } },
            { name: { contains: trimmedSearch, mode: "insensitive" as const } },
            { status: { contains: trimmedSearch, mode: "insensitive" as const } },
          ],
        }
      : undefined,
    orderBy: [
      { name: "asc" },
      { domain: "asc" },
    ],
    include: { _count: { select: { pages: true } } },
  })

  return domains.map(mapDomainToSite)
}

export async function getPaginatedPropertyOptions(input?: {
  search?: string
  page?: number
  pageSize?: number
  selectedPropertyId?: string
}): Promise<PaginatedPropertyOptions> {
  const trimmedSearch = input?.search?.trim()
  const requestedPageSize = input?.pageSize ?? 10
  const pageSize = Math.min(100, Math.max(1, Math.floor(requestedPageSize)))
  const where = trimmedSearch
    ? {
        OR: [
          { domain: { contains: trimmedSearch, mode: "insensitive" as const } },
          { name: { contains: trimmedSearch, mode: "insensitive" as const } },
          { status: { contains: trimmedSearch, mode: "insensitive" as const } },
        ],
      }
    : undefined

  const requestedPage = Math.max(1, Math.floor(input?.page ?? 1))
  const [totalCount, selectedDomain] = await Promise.all([
    prisma.domain.count({ where }),
    input?.selectedPropertyId
      ? prisma.domain.findFirst({
          where: {
            id: input.selectedPropertyId,
            ...(where ?? {}),
          },
          select: {
            id: true,
            domain: true,
            name: true,
            lastCrawled: true,
            status: true,
            addedOn: true,
            details: true,
          },
        })
      : Promise.resolve(null),
  ])
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const selectedPropertyId = input?.selectedPropertyId
  const hasSelectedDomain = Boolean(selectedDomain)
  const shouldPinSelectedDomain = hasSelectedDomain && page === 1
  const skip = hasSelectedDomain
    ? Math.max(0, (page - 1) * pageSize - 1)
    : (page - 1) * pageSize

  const domains = await prisma.domain.findMany({
    where: hasSelectedDomain
      ? {
          AND: [
            where ?? {},
            { id: { not: selectedPropertyId } },
          ],
        }
      : where,
    orderBy: [
      { name: "asc" },
      { domain: "asc" },
    ],
    skip,
    take: shouldPinSelectedDomain ? Math.max(0, pageSize - 1) : pageSize,
    select: {
      id: true,
      domain: true,
      name: true,
      lastCrawled: true,
      status: true,
      addedOn: true,
      details: true,
    },
  })

  const properties = [
    ...(shouldPinSelectedDomain && selectedDomain ? [mapDomainToSite(selectedDomain)] : []),
    ...domains.map(mapDomainToSite),
  ]

  return {
    properties,
    page,
    pageSize,
    totalCount,
    totalPages,
  }
}

export async function getPropertyDashboard(propertyId: string): Promise<PropertyDashboard | null> {
  const domain = await prisma.domain.findUnique({
    where: { id: propertyId },
    include: { _count: { select: { pages: true } } },
  })

  if (!domain) return null

  const property = mapDomainToSite(domain)
  const [totalPages, indexedPagesCount, linksCount, crawlErrorsCount, recentPageRows, indexedPageRows, crawlErrorRows, linkRows, contentPageRows] = await Promise.all([
    prisma.page.count({ where: { domainId: propertyId } }),
    prisma.page.count({ where: { domainId: propertyId, status: "Indexed" } }),
    prisma.link.count({ where: { OR: [{ fromDomain: propertyId }, { toDomain: propertyId }] } }),
    prisma.page.count({
      where: {
        domainId: propertyId,
        OR: [
          { statusCode: { gte: 300 } },
          { status: { in: ["Error", "Redirect", "Skipped"] } },
        ],
      },
    }),
    prisma.page.findMany({
      where: { domainId: propertyId },
      orderBy: [
        { lastCrawled: "desc" },
        { addedOn: "desc" },
      ],
      take: 8,
      include: { domain: { select: { domain: true, name: true } } },
    }),
    prisma.page.findMany({
      where: { domainId: propertyId, status: "Indexed" },
      orderBy: [
        { lastCrawled: "desc" },
        { addedOn: "desc" },
      ],
      take: 8,
      include: { domain: { select: { domain: true, name: true } } },
    }),
    prisma.page.findMany({
      where: {
        domainId: propertyId,
        OR: [
          { statusCode: { gte: 300 } },
          { status: { in: ["Error", "Redirect", "Skipped"] } },
        ],
      },
      orderBy: [
        { lastCrawled: "desc" },
        { addedOn: "desc" },
      ],
      take: 8,
      include: { domain: { select: { domain: true } } },
    }),
    prisma.link.findMany({
      where: { OR: [{ fromDomain: propertyId }, { toDomain: propertyId }] },
      orderBy: { firstCrawlOn: "desc" },
      take: 10,
      include: {
        from: { select: { domain: true } },
        to: { select: { domain: true } },
      },
    }),
    prisma.page.findMany({
      where: { domainId: propertyId },
      orderBy: [
        { lastCrawled: "desc" },
        { addedOn: "desc" },
      ],
      take: 200,
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
    }),
  ])

  const contentItems: ContentItem[] = []
  const seenContentUrls = new Set<string>()

  for (const page of contentPageRows) {
    if (contentItems.length >= 12) break

    const sourcePageTitle = page.title || page.url
    const directContent = classifyContentUrl(page.url)
    if (directContent && !seenContentUrls.has(page.url)) {
      seenContentUrls.add(page.url)
      contentItems.push({
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
      })
    }

    if (contentItems.length >= 12) break

    for (const asset of readContentAssets(page.data, page.url)) {
      if (contentItems.length >= 12) break

      const assetContent = asset.kind && asset.fileType
        ? { kind: asset.kind, fileType: asset.fileType }
        : classifyContentUrl(asset.url)
      if (!assetContent || seenContentUrls.has(asset.url)) continue

      seenContentUrls.add(asset.url)
      contentItems.push({
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
      })
    }
  }

  return {
    property,
    counts: {
      totalPages,
      indexedPages: indexedPagesCount,
      links: linksCount,
      crawlErrors: crawlErrorsCount,
      contentSamples: contentItems.length,
    },
    recentPages: recentPageRows.map((page): ManagedPage => ({
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
    })),
    indexedPages: indexedPageRows.map((page): ManagedPage => ({
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
    })),
    crawlErrors: crawlErrorRows.map((page) => {
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
    }),
    links: linkRows.map((link) => ({
      id: link.id,
      sourceUrl: link.linkFrom,
      targetUrl: link.linkTo,
      sourceDomain: link.from.domain,
      targetDomain: link.to.domain,
      sourceType: link.sourceType,
      anchorText: link.anchorText,
      firstCrawlOn: link.firstCrawlOn,
    })),
    content: contentItems,
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
  rootHostname: string
  disallow: RegExp[]
  sitemapReferencesByUrl: Map<string, Set<string>>
  stats: CrawlResourceStats
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
      html,
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

    await saveDiscoveredLinksAndPages(siteId, pageUrl, extractPageLinks($), sitemapReferencesByUrl, rootHostname, stats, pageId)
    await saveDiscoveredAssets(siteId, pageUrl, extractPageAssets($), sitemapReferencesByUrl, rootHostname, stats, pageId)
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
  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }
  const robotsTxt = await getRobotsTxt(page.domain.domain)
  const { disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { disallow: [] }

  for (const reference of await findSitemapReferencesForUrl(page.url, page.domain.domain)) {
    addSitemapReference(sitemapReferencesByUrl, page.url, reference.sitemapUrl)
  }

  await updateDomainDetails(page.domainId, {
    currentActivity: `Crawling ${page.url}`,
    currentCrawlUrl: page.url,
  })

  await crawlStoredPage({
    siteId: page.domainId,
    pageId: page.id,
    pageUrl: page.url,
    rootHostname: getDomainName(page.domain.domain),
    disallow,
    sitemapReferencesByUrl,
    stats,
  })

  await prisma.domain.update({
    where: { id: page.domainId },
    data: {
      lastCrawled: new Date(),
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

async function crawlPendingPagesForDomain(
  siteId: string,
  rootHostname: string,
  disallow: RegExp[],
  stats: CrawlResourceStats,
  sitemapReferencesByUrl = new Map<string, Set<string>>(),
) {
  const crawledUrls = new Set<string>()
  let pagesProcessed = 0

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
      currentCrawlUrl: pendingPage.url,
      pagesCrawled: pagesProcessed,
      internalResourcesFound: stats.internalResourcesFound,
      externalResourcesFound: stats.externalResourcesFound,
    })

    const crawledHtmlPage = await crawlStoredPage({
      siteId,
      pageId: pendingPage.id,
      pageUrl: pendingPage.url,
      rootHostname,
      disallow,
      sitemapReferencesByUrl,
      stats,
      crawledUrls,
    })
    if (crawledHtmlPage) {
      pagesProcessed++
    }

    await updateDomainDetails(siteId, {
      pagesCrawled: pagesProcessed,
      internalResourcesFound: stats.internalResourcesFound,
      externalResourcesFound: stats.externalResourcesFound,
    })

    await sleep(100)
  }

  return {
    pagesProcessed,
    crawledUrls,
  }
}

export async function resumePendingCrawler(siteId: string) {
  if (!siteId) {
    throw new Error("siteId is required.")
  }

  try {
    const domain = await prisma.domain.findUnique({
      where: { id: siteId },
      select: { domain: true, details: true },
    })

    if (!domain) {
      throw new Error("Domain not found.")
    }
    const details = readDetails(domain.details)
    const stats: CrawlResourceStats = {
      internalResourcesFound: details.internalResourcesFound ?? 0,
      externalResourcesFound: details.externalResourcesFound ?? 0,
    }

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Crawling",
        details: {
          ...details,
          currentActivity: "Resuming pending crawl queue...",
          currentCrawlUrl: "",
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
        },
      },
    })

    const robotsTxt = await getRobotsTxt(domain.domain)
    const { disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { disallow: [] }
    const { crawledUrls } = await crawlPendingPagesForDomain(siteId, getDomainName(domain.domain), disallow, stats)

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Active",
        lastCrawled: new Date(),
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          pagesCrawled: crawledUrls.size,
          currentActivity: "Pending crawl complete.",
          currentCrawlUrl: "",
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
        },
      },
    })
  } catch (error: any) {
    await logError(error, "resumePendingCrawler")
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Error",
        details: {
          currentActivity: `Pending crawl failed: ${error.message}`,
        },
      },
    })
  }
}

export async function runCrawler(siteId: string, siteUrl: string) {
  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  const sitemapReferencesByUrl = new Map<string, Set<string>>()
  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }

  try {
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Crawling",
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          currentActivity: "Fetching robots.txt...",
          currentCrawlUrl: "",
          pagesCrawled: 0,
          internalResourcesFound: 0,
          externalResourcesFound: 0,
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

    await saveDiscoveredPage({ siteId, url: siteUrl, source: "seed", kind: "page" })

    const { crawledUrls } = await crawlPendingPagesForDomain(siteId, getDomainName(siteUrl), disallow, stats, sitemapReferencesByUrl)

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Active",
        lastCrawled: new Date(),
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          pagesCrawled: crawledUrls.size,
          currentActivity: "Crawl complete.",
          currentCrawlUrl: "",
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
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
  const stats: CrawlResourceStats = { internalResourcesFound: 0, externalResourcesFound: 0 }
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
          currentCrawlUrl: "",
          pagesCrawled: 0,
          internalResourcesFound: 0,
          externalResourcesFound: 0,
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
          if (!isInternalCrawlUrl(entry.url, rootDomain)) {
            stats.externalResourcesFound++
            continue
          }
          stats.internalResourcesFound++
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
          if (!isInternalCrawlUrl(entry.url, rootDomain)) {
            stats.externalResourcesFound++
            continue
          }
          stats.internalResourcesFound++
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
        currentCrawlUrl: currentUrl,
        pagesCrawled: pagesProcessed,
        internalResourcesFound: stats.internalResourcesFound,
        externalResourcesFound: stats.externalResourcesFound,
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
        let sourcePageId: string
        if (existingPage) {
          await prisma.page.update({ where: { id: existingPage.id }, data: pageData })
          sourcePageId = existingPage.id
        } else {
          sourcePageId = (await prisma.page.create({ data: pageData, select: { id: true } })).id
        }

        pagesProcessed++
        const seenTargetUrls = new Set<string>()

        for (const link of $("a").toArray()) {
          const href = $(link).attr("href")
          if (!href || isPlaceholderLinkValue(href)) continue
          try {
            const absoluteUrl = normalizeDiscoveredUrl(href, currentUrl)
            if (isIgnoredCrawlUrl(absoluteUrl)) continue
            const absoluteUrlKey = buildCrawlUrlKey(absoluteUrl)
            if (seenTargetUrls.has(absoluteUrlKey)) continue
            seenTargetUrls.add(absoluteUrlKey)

            const targetHostname = getDomainName(absoluteUrl)
            const isInternalLink = targetHostname === rootDomain
            if (isInternalLink) {
              stats.internalResourcesFound++
            } else {
              stats.externalResourcesFound++
            }
            const targetPageId = isInternalLink
              ? await saveDiscoveredPage({
                  siteId,
                  url: absoluteUrl,
                  referrer: currentUrl,
                  source: "anchor",
                  kind: classifyContentUrl(absoluteUrl)?.kind || "page",
                  fileType: classifyContentUrl(absoluteUrl)?.fileType,
                  sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, absoluteUrl),
                })
              : undefined
            await saveDiscoveredLink({
              siteId,
              sourceUrl: currentUrl,
              targetUrl: absoluteUrl,
              sourcePageId,
              targetPageId,
              sourceType: "anchor",
              anchorText: $(link).text(),
              titleText: $(link).attr("title") || undefined,
              rel: $(link).attr("rel") || undefined,
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

        for (const link of await discoverClientSideNavigationLinks(renderedPage, currentUrl)) {
          try {
            const targetUrlKey = buildCrawlUrlKey(link.targetUrl)
            if (seenTargetUrls.has(targetUrlKey)) continue
            seenTargetUrls.add(targetUrlKey)

            const targetHostname = getDomainName(link.targetUrl)
            const isInternalLink = targetHostname === rootDomain
            if (isInternalLink) {
              stats.internalResourcesFound++
            } else {
              stats.externalResourcesFound++
            }

            const targetPageId = isInternalLink
              ? await saveDiscoveredPage({
                  siteId,
                  url: link.targetUrl,
                  referrer: currentUrl,
                  source: "anchor",
                  kind: classifyContentUrl(link.targetUrl)?.kind || "page",
                  fileType: classifyContentUrl(link.targetUrl)?.fileType,
                  sitemapReferences: readSitemapReferences(sitemapReferencesByUrl, link.targetUrl),
                })
              : undefined

            await saveDiscoveredLink({
              siteId,
              sourceUrl: currentUrl,
              targetUrl: link.targetUrl,
              sourcePageId,
              targetPageId,
              sourceType: "anchor",
              anchorText: link.anchorText,
              titleText: link.titleText,
              rel: link.rel,
            })

            if (isInternalLink) {
              const normalizedInternalUrl = new URL(link.targetUrl).origin + new URL(link.targetUrl).pathname
              if (!crawledUrls.has(normalizedInternalUrl) && !urlQueue.includes(link.targetUrl)) {
                urlQueue.push(link.targetUrl)
              }
            }
          } catch {
          }
        }

        await saveDiscoveredAssets(siteId, currentUrl, extractPageAssets($), sitemapReferencesByUrl, rootDomain, stats, sourcePageId)
        await updateDomainDetails(siteId, {
          pagesCrawled: pagesProcessed,
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
        })
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
          currentCrawlUrl: "",
          internalResourcesFound: stats.internalResourcesFound,
          externalResourcesFound: stats.externalResourcesFound,
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
  return domain ? enrichManagedDomainBranding(mapDomainToSite(domain)) : null
}

export async function getActiveNeupbotCrawls(): Promise<NeupbotCrawlActivity[]> {
  const domains = await prisma.domain.findMany({
    where: { status: "Crawling" },
    orderBy: { addedOn: "asc" },
    select: {
      id: true,
      domain: true,
      name: true,
      status: true,
      lastCrawled: true,
      addedOn: true,
      details: true,
      _count: {
        select: {
          pages: true,
        },
      },
    },
  })

  return domains.map((domain) => {
    const site = mapDomainToSite(domain)
    return {
      siteId: site.id,
      siteUrl: site.url,
      siteName: site.name,
      status: site.status,
      currentActivity: site.currentlyCrawling,
      currentCrawlUrl: site.currentCrawlUrl,
      pagesCrawled: site.pagesCrawled ?? 0,
      internalResourcesFound: site.internalResourcesFound ?? 0,
      externalResourcesFound: site.externalResourcesFound ?? 0,
      lastCrawled: site.lastCrawled,
    }
  })
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
