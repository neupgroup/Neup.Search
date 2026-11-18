import { NextRequest, NextResponse } from "next/server"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import {
  runSinglePageCrawler,
} from "@/services/neupbot"
import { createDomainForCrawl } from "@/services/projects/create"
import { InvalidDomainError } from "@/services/projects/domain"
import { extractMarkdownFromHtml } from "@/services/crawl/markdown"
import { makeHtmlLinksAbsolute } from "@/services/crawl/links"
import { crawlPageToHtml } from "@/services/crawl/html"
import * as cheerio from "cheerio"

const crawlResponseFormats = ["markdown", "html", "raw", "links", "images"] as const
type CrawlResponseFormat = typeof crawlResponseFormats[number]

// Return the crawl API's standard success response shape.
function crawlSuccess(result: unknown, status = 200) {
  return NextResponse.json({ success: true, result }, { status })
}

// Return the crawl API's standard failure response shape.
function crawlFailure(message: string, status: number, code = "crawl_error") {
  return NextResponse.json({
    success: false,
    error: { code, description: message },
  }, { status })
}

// Return a JSON failure for methods the crawl endpoint does not support.
function crawlMethodNotAllowed() {
  return crawlFailure("Method not allowed.", 405, "method_not_allowed")
}

// Parse the requested absolute page URL while defaulting scheme-less input to HTTPS.
function normalizeCrawlUrl(input: string) {
  const trimmedUrl = input.trim()
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`

  try {
    const url = new URL(candidate)
    if (!url.hostname || !["http:", "https:"].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

// Parse comma-separated response fields when the caller requests a response.
function parseCrawlResponseFormats(request: NextRequest): CrawlResponseFormat[] | null {
  if (request.nextUrl.searchParams.get("respond") !== "true") return []
  const formatValue = request.nextUrl.searchParams.get("format")
  if (!formatValue) return null

  const formats = formatValue.split(",").map((format) => format.trim()).filter(Boolean)
  if (formats.length === 0 || formats.some((format) => !crawlResponseFormats.includes(format as CrawlResponseFormat))) {
    return null
  }
  return [...new Set(formats)] as CrawlResponseFormat[]
}

// Build requested response fields from the one page saved by the crawler.
async function buildRequestedCrawlResult(
  page: NonNullable<Awaited<ReturnType<typeof runSinglePageCrawler>>>,
  formats: CrawlResponseFormat[],
) {
  const result: Record<string, unknown> = {}
  const needsHtml = formats.some((format) => format === "markdown" || format === "html" || format === "raw" || format === "images")
  const live = needsHtml ? await crawlPageToHtml(page.url) : null
  const baseUrl = live?.url || page.url
  const html = live?.html || ""
  const fixedHtml = makeHtmlLinksAbsolute(html, baseUrl)

  if (formats.includes("markdown")) {
    result.markdown = extractMarkdownFromHtml(fixedHtml, baseUrl).markdown
  }
  if (formats.includes("html")) {
    result.html = fixedHtml
  }
  if (formats.includes("raw")) {
    result.raw = fixedHtml
  }
  if (formats.includes("links")) {
    const links = await prisma.resource.findMany({
      where: { sourcePageId: page.id, type: "link" },
      orderBy: { firstCrawlOn: "asc" },
      select: { anchorText: true, linkTo: true },
    })
    result.links = links.map((link) => ({ text: link.anchorText || "", link: link.linkTo }))
  }
  if (formats.includes("images")) {
    const $ = cheerio.load(fixedHtml)
    result.images = $("img[src]").map((_, image) => ({ caption: $(image).attr("alt") || "", imageurl: new URL($(image).attr("src") || "", baseUrl).toString() })).get()
  }

  return result
}

// Start a crawl for the submitted project URL.
export async function POST(request: NextRequest) {
  const responseFormats = parseCrawlResponseFormats(request)
  if (responseFormats === null) {
    return crawlFailure(`When respond=true, format must contain one or more of: ${crawlResponseFormats.join(", ")}.`, 400, "invalid_format")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return crawlFailure("Request body must be valid JSON.", 400, "invalid_body")
  }

  const providedUrl = body && typeof body === "object" && "url" in body && typeof body.url === "string"
    ? body.url.trim()
    : ""

  if (!providedUrl) return crawlFailure("The url field is required in the JSON body.", 400, "missing_url")
  const url = normalizeCrawlUrl(providedUrl)
  if (!url) return crawlFailure("Only http:// and https:// protocols are supported.", 400, "invalid_url")

  try {
    const { domain, siteUrl } = await createDomainForCrawl({ url })
    const page = await runSinglePageCrawler(domain.id, siteUrl)
    if (!page) return crawlFailure("The page could not be saved.", 500, "crawl_failed")
    if (page.details && typeof page.details === "object" && !Array.isArray(page.details) && "crawlResultStatus" in page.details && page.details.crawlResultStatus === "Error") {
      const details = page.details && typeof page.details === "object" && !Array.isArray(page.details) ? page.details as Record<string, unknown> : {}
      const description = typeof details.crawlError === "string" ? details.crawlError : `The requested page returned an error${page.statusCode ? ` (HTTP ${page.statusCode})` : ""}.`
      return crawlFailure(description, 502, "crawl_failed")
    }

    if (responseFormats.length > 0) {
      return crawlSuccess(await buildRequestedCrawlResult(page, responseFormats))
    }

    const result = {
      id: domain.id,
      slug: `${domain.domain}--${domain.id}`,
      url: siteUrl,
      status: page.status,
      statusCode: page.statusCode,
      lastCrawled: page.lastCrawled,
    }
    return crawlSuccess(result)
  } catch (error) {
    if (error instanceof InvalidDomainError) return crawlFailure(error.message, 400, "invalid_url")
    await logError(error, "api.crawl")
    const description = error instanceof Error ? error.message : String(error)
    const isInvalidUrl = error instanceof TypeError && /invalid url/i.test(description)
    return crawlFailure(description, isInvalidUrl ? 400 : 500, isInvalidUrl ? "invalid_url" : "crawl_failed")
  }
}

export const GET = crawlMethodNotAllowed
export const PUT = crawlMethodNotAllowed
export const PATCH = crawlMethodNotAllowed
export const DELETE = crawlMethodNotAllowed
export const OPTIONS = crawlMethodNotAllowed
