import * as cheerio from "cheerio"
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
  lastVisibleId: string | null
  firstVisibleId: string | null
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
    const [key, value] = line.split(":").map((part) => part.trim())
    if (key?.toLowerCase() === "user-agent") {
      isOurBot = value === "*" || value === neupbotUserAgent
    } else if (isOurBot && key?.toLowerCase() === "sitemap" && value) {
      sitemaps.push(value)
    } else if (isOurBot && key?.toLowerCase() === "disallow" && value) {
      disallow.push(new RegExp("^" + value.replace(/\*/g, ".*").replace(/\//g, "\\/")))
    }
  })

  return { sitemaps, disallow }
}

async function getSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl, { headers: { "User-Agent": neupbotUserAgent } })
    if (!response.ok) return []

    const xml = await response.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    const urls = $("url > loc").map((_: number, el: cheerio.Element) => $(el).text()).get()
    const nestedSitemaps = $("sitemap > loc").map((_: number, el: cheerio.Element) => $(el).text()).get()

    for (const nestedSitemap of nestedSitemaps) {
      urls.push(...await getSitemapUrls(nestedSitemap))
    }

    return urls
  } catch (error) {
    await logError({ error, sitemapUrl }, "getSitemapUrls")
    return []
  }
}

export async function runCrawler(siteId: string, siteUrl: string) {
  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  const rootDomain = getDomainName(siteUrl)
  const crawledUrls = new Set<string>()
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
    const urlQueue: string[] = []

    if (sitemaps.length > 0) {
      await updateDomainDetails(siteId, { currentActivity: `Found ${sitemaps.length} sitemaps. Parsing...` })
      for (const sitemapUrl of sitemaps) {
        urlQueue.push(...await getSitemapUrls(sitemapUrl))
      }
    } else {
      const sitemapUrls = await getSitemapUrls(new URL("/sitemap.xml", siteUrl).toString())
      if (sitemapUrls.length > 0) {
        await updateDomainDetails(siteId, { currentActivity: "Found default sitemap.xml. Parsing..." })
        urlQueue.push(...sitemapUrls)
      }
    }

    if (urlQueue.length === 0) {
      urlQueue.push(siteUrl)
    }

    while (urlQueue.length > 0) {
      const currentDomain = await prisma.domain.findUnique({ where: { id: siteId }, select: { status: true } })
      if (currentDomain?.status !== "Crawling") {
        await updateDomainDetails(siteId, { currentActivity: "Crawl cancelled." })
        break
      }

      const currentUrl = urlQueue.shift()!
      const parsedCurrentUrl = new URL(currentUrl)
      const normalizedUrl = parsedCurrentUrl.origin + parsedCurrentUrl.pathname

      if (crawledUrls.has(normalizedUrl) || disallow.some((regex) => regex.test(parsedCurrentUrl.pathname))) {
        continue
      }

      await updateDomainDetails(siteId, {
        currentActivity: `Crawling ${currentUrl}`,
        pagesCrawled: pagesProcessed,
      })

      try {
        const response = await fetch(currentUrl, {
          headers: { "User-Agent": neupbotUserAgent },
          redirect: "manual",
        })
        crawledUrls.add(normalizedUrl)

        const contentType = response.headers.get("content-type")
        const redirectLocation = response.headers.get("location")
        if (response.status >= 300 && response.status < 400) {
          const targetUrl = redirectLocation ? new URL(redirectLocation, currentUrl).toString() : null
          const existingPage = await prisma.page.findFirst({ where: { url: currentUrl, domainId: siteId }, select: { id: true } })
          const data = [{
            contentType,
            headers: Object.fromEntries(response.headers.entries()),
            redirectLocation: targetUrl,
          }]
          const pageData = {
            domainId: siteId,
            url: currentUrl,
            title: null,
            description: null,
            type: contentType || "redirect",
            data,
            fullContent: null,
            status: "Redirect",
            statusCode: response.status,
            lastCrawled: new Date(),
          }

          if (existingPage) {
            await prisma.page.update({ where: { id: existingPage.id }, data: pageData })
          } else {
            await prisma.page.create({ data: pageData })
          }

          if (targetUrl && getDomainName(targetUrl) === rootDomain) {
            const normalizedTargetUrl = new URL(targetUrl).origin + new URL(targetUrl).pathname
            if (!crawledUrls.has(normalizedTargetUrl) && !urlQueue.includes(targetUrl)) {
              urlQueue.push(targetUrl)
            }
          }
          continue
        }

        const isHtml = contentType?.includes("text/html") ?? false
        if (!response.ok || !isHtml) {
          const existingPage = await prisma.page.findFirst({ where: { url: currentUrl, domainId: siteId }, select: { id: true } })
          const data = [{ contentType, headers: Object.fromEntries(response.headers.entries()) }]
          const pageData = {
            domainId: siteId,
            url: currentUrl,
            title: null,
            description: null,
            type: contentType || "unknown",
            data,
            fullContent: null,
            status: response.ok ? "Skipped" : "Error",
            statusCode: response.status,
            lastCrawled: new Date(),
          }
          if (existingPage) {
            await prisma.page.update({ where: { id: existingPage.id }, data: pageData })
          } else {
            await prisma.page.create({ data: pageData })
          }
          continue
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
          statusCode: response.status,
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
            const absoluteUrl = new URL(href, siteUrl).toString().split("#")[0]
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
      } catch (fetchError) {
        await logError({ error: fetchError, currentUrl }, "crawlSite_fetch")
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

export async function getManagedDomainById(siteId: string): Promise<ManagedDomain | null> {
  const domain = await prisma.domain.findUnique({
    where: { id: siteId },
    include: { _count: { select: { pages: true } } },
  })
  return domain ? mapDomainToSite(domain) : null
}

export async function getPagesForDomain(siteId: string, startAfterDocId?: string): Promise<PaginatedDomainPages> {
  const rows = await prisma.page.findMany({
    where: { domainId: siteId },
    orderBy: { url: "asc" },
    take: 20,
    ...(startAfterDocId ? { cursor: { id: startAfterDocId }, skip: 1 } : {}),
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
    lastVisibleId: pages[pages.length - 1]?.id || null,
    firstVisibleId: pages[0]?.id || null,
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
