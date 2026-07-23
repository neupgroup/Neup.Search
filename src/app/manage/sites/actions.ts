"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import * as cheerio from "cheerio"
import { prisma } from "@/lib/prisma"
import type { Page, PaginatedPages } from "../pages/actions"
import { summarizeSite } from "@/ai/flows/summarize-site-flow"
import { logError } from "@/lib/logging"

const DomainSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }),
  description: z.string().min(1, { message: "Description is required." }),
})

type DomainDetails = {
  description?: string
  summary?: string
  logoUrl?: string
  currentActivity?: string
  pagesCrawled?: number
}

export type Site = {
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

export type PaginatedSites = {
  sites: Site[]
  lastVisibleId: string | null
}

export type PaginatedSitePages = {
  pages: Page[]
  lastVisibleId: string | null
  firstVisibleId: string | null
}

function normalizeSiteUrl(input: string) {
  const url = new URL(input)
  url.hash = ""
  url.pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")
  url.search = ""
  return url.toString()
}

function getDomainName(input: string) {
  return new URL(input).hostname
}

function readDetails(details: unknown): DomainDetails {
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
}): Site {
  const details = readDetails(domain.details)
  return {
    id: domain.id,
    url: domain.domain,
    description: details.description || "",
    status: domain.status as Site["status"],
    lastCrawled: domain.lastCrawled ? domain.lastCrawled.toLocaleDateString() : "Never",
    createdAt: domain.addedOn,
    pagesCrawled: domain._count?.pages ?? details.pagesCrawled ?? 0,
    currentlyCrawling: details.currentActivity,
    name: domain.name || undefined,
    logoUrl: details.logoUrl,
    summary: details.summary,
  }
}

async function updateDomainDetails(domainId: string, details: DomainDetails) {
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

export async function addSite(prevState: any, formData: FormData) {
  const validatedFields = DomainSchema.safeParse({
    url: formData.get("url"),
    description: formData.get("description"),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const siteUrl = normalizeSiteUrl(validatedFields.data.url)

  try {
    const newDomain = await prisma.domain.upsert({
      where: { domain: siteUrl },
      create: {
        domain: siteUrl,
        name: getDomainName(siteUrl),
        status: "Pending",
        details: {
          description: validatedFields.data.description,
          currentActivity: "Queued for crawl.",
          pagesCrawled: 0,
        },
      },
      update: {
        details: {
          description: validatedFields.data.description,
          currentActivity: "Queued for crawl.",
        },
      },
    })

    const crawlFormData = new FormData()
    crawlFormData.append("siteId", newDomain.id)
    crawlFormData.append("siteUrl", siteUrl)
    crawlSite(crawlFormData).catch((error) => logError(error, "crawlSite_async"))
  } catch (error) {
    await logError(error, "addSite")
    return {
      errors: { _server: ["Could not add domain. Please try again."] },
    }
  }

  revalidatePath("/manage/sites")
  redirect("/manage/sites")
}

export async function summarizeSiteAction(formData: FormData) {
  const siteId = formData.get("siteId") as string
  const siteUrl = formData.get("siteUrl") as string

  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  try {
    await updateDomainDetails(siteId, { currentActivity: "Summarizing domain..." })
    const summaryData = await summarizeSite({ url: siteUrl })

    await prisma.domain.update({
      where: { id: siteId },
      data: {
        name: summaryData.name || getDomainName(siteUrl),
        details: {
          ...readDetails((await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } }))?.details),
          summary: summaryData.summary || undefined,
          logoUrl: summaryData.logoUrl || undefined,
          currentActivity: "",
        },
      },
    })
  } catch (error) {
    await logError(error, "summarizeSiteAction")
    await prisma.domain.update({
      where: { id: siteId },
      data: {
        status: "Error",
        details: {
          currentActivity: "Failed to summarize domain.",
        },
      },
    })
  } finally {
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/sites")
  }
}

export async function getSites(search?: string, startAfterDocId?: string): Promise<PaginatedSites> {
  try {
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
  } catch (error) {
    await logError(error, "getSites")
    return { sites: [], lastVisibleId: null }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const userAgent = "NeupBot/1.0 (+https://neupgroup.com/neupbot; crawler.neupbot@neupgroup.com)"

async function getRobotsTxt(siteUrl: string): Promise<string | null> {
  try {
    const robotsUrl = new URL("/robots.txt", siteUrl)
    const response = await fetch(robotsUrl.toString(), { headers: { "User-Agent": userAgent } })
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
      isOurBot = value === "*" || value === userAgent
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
    const response = await fetch(sitemapUrl, { headers: { "User-Agent": userAgent } })
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

export async function crawlSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  const siteUrl = formData.get("siteUrl") as string

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
        const response = await fetch(currentUrl, { headers: { "User-Agent": userAgent } })
        crawledUrls.add(normalizedUrl)

        const contentType = response.headers.get("content-type")
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

        for (const link of $("a").toArray()) {
          const href = $(link).attr("href")
          if (!href) continue
          try {
            const absoluteUrl = new URL(href, siteUrl).toString().split("#")[0]
            if (getDomainName(absoluteUrl) === rootDomain) {
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
  } finally {
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/sites")
    revalidatePath("/manage/pages")
  }
}

export async function getSiteById(siteId: string): Promise<Site | null> {
  try {
    const domain = await prisma.domain.findUnique({
      where: { id: siteId },
      include: { _count: { select: { pages: true } } },
    })
    return domain ? mapDomainToSite(domain) : null
  } catch (error) {
    await logError(error, "getSiteById")
    return null
  }
}

export async function getPagesForSite(siteId: string, startAfterDocId?: string): Promise<PaginatedSitePages> {
  try {
    const rows = await prisma.page.findMany({
      where: { domainId: siteId },
      orderBy: { url: "asc" },
      take: 20,
      ...(startAfterDocId ? { cursor: { id: startAfterDocId }, skip: 1 } : {}),
      include: { domain: { select: { domain: true, name: true } } },
    })

    const pages = rows.map((page): Page => ({
      id: page.id,
      url: page.url,
      title: page.title || "No title",
      description: page.description || "No description",
      siteUrl: page.domain.domain,
      status: page.status as Page["status"],
      lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
      createdAt: page.addedOn,
      content: page.fullContent || undefined,
    }))

    return {
      pages,
      lastVisibleId: pages[pages.length - 1]?.id || null,
      firstVisibleId: pages[0]?.id || null,
    }
  } catch (error) {
    await logError(error, "getPagesForSite")
    return { pages: [], lastVisibleId: null, firstVisibleId: null }
  }
}

export async function getDashboardStats() {
  try {
    const totalSites = await prisma.domain.count()
    const totalPages = await prisma.page.count()
    const activeCrawls = await prisma.domain.count({ where: { status: "Crawling" } })
    const crawlErrors = await prisma.domain.count({ where: { status: "Error" } })
    return { totalSites, totalPages, activeCrawls, crawlErrors }
  } catch (error) {
    await logError(error, "getDashboardStats")
    return { totalSites: 0, totalPages: 0, activeCrawls: 0, crawlErrors: 0 }
  }
}

export async function cancelCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
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
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/sites")
  } catch (error) {
    await logError(error, "cancelCrawl")
  }
}

export async function deletePagesForSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
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
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/pages")
  } catch (error) {
    await logError(error, "deletePagesForSite")
  }
}

export async function deleteLinksForPage() {
  return
}

export async function crawlAllSites() {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: { addedOn: "desc" },
      select: { id: true, domain: true },
    })

    for (const domain of domains) {
      const formData = new FormData()
      formData.append("siteId", domain.id)
      formData.append("siteUrl", domain.domain)
      crawlSite(formData)
    }
  } catch (error) {
    await logError(error, "crawlAllSites")
  } finally {
    revalidatePath("/manage/sites")
  }
}
