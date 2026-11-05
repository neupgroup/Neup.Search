import { NextRequest } from "next/server"
import { jsonError, jsonResponse } from "@/lib/bridge-api"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import { createDomainForCrawl, InvalidDomainError, runCrawler, runJavascriptCrawler } from "@/services/neupbot"

const crawlResponseFormats = ["html", "rendered", "link", "link.images", "link.media"] as const
type CrawlResponseFormat = typeof crawlResponseFormats[number]

// Validate the optional response format before creating a crawl.
function parseCrawlResponseOptions(request: NextRequest) {
  const respond = request.nextUrl.searchParams.get("respond") === "true"
  const formatValue = request.nextUrl.searchParams.get("format") || "html"
  if (!crawlResponseFormats.includes(formatValue as CrawlResponseFormat)) {
    return { error: `format must be one of: ${crawlResponseFormats.join(", ")}.` }
  }
  return { respond, format: formatValue as CrawlResponseFormat }
}

// Return the requested representation of pages collected by this crawl.
async function getCrawlResponse(siteId: string, format: CrawlResponseFormat) {
  const pages = await prisma.page.findMany({
    where: { domainId: siteId },
    orderBy: { addedOn: "asc" },
    select: { url: true, title: true, fullContent: true, data: true },
  })

  if (format === "html" || format === "rendered") {
    return pages.map((page) => {
      const captured = page.data[0] as unknown as Record<string, unknown> | undefined
      return {
        url: page.url,
        title: page.title,
        content: format === "html" ? captured?.html ?? null : captured?.bodyHtml ?? page.fullContent,
      }
    })
  }

  if (format === "link") {
    return prisma.link.findMany({
      where: { fromDomain: siteId },
      orderBy: { firstCrawlOn: "asc" },
      select: { linkFrom: true, linkTo: true, anchorText: true, titleText: true, rel: true },
    })
  }

  return pages.flatMap((page) => {
    const captured = page.data[0] as unknown as Record<string, unknown> | undefined
    const images = Array.isArray(captured?.images) ? captured.images : []
    const media = [
      ...(Array.isArray(captured?.videos) ? captured.videos : []),
      ...(Array.isArray(captured?.audios) ? captured.audios : []),
      ...(Array.isArray(captured?.iframes) ? captured.iframes : []),
    ]
    const items = format === "link.images" ? images : media
    return items.map((item) => ({ pageUrl: page.url, item }))
  })
}

// Start a crawl for the submitted project URL.
export async function POST(request: NextRequest) {
  const responseOptions = parseCrawlResponseOptions(request)
  if ("error" in responseOptions) return jsonError(responseOptions.error, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("Request body must be valid JSON.", 400)
  }

  const url = body && typeof body === "object" && "url" in body && typeof body.url === "string"
    ? body.url.trim()
    : ""

  if (!url) return jsonError("The url field is required.", 400)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    return jsonError("Enter a domain or IP address without http:// or https://.", 400)
  }

  try {
    const { domain, siteUrl } = await createDomainForCrawl({ url: `https://${url}` })
    if (responseOptions.respond) {
      if (responseOptions.format === "rendered") {
        await runJavascriptCrawler(domain.id, siteUrl)
      } else {
        await runCrawler(domain.id, siteUrl)
      }
      const data = await getCrawlResponse(domain.id, responseOptions.format)
      return jsonResponse({
        id: domain.id,
        slug: `${domain.domain}--${domain.id}`,
        url: siteUrl,
        status: (await prisma.domain.findUnique({ where: { id: domain.id }, select: { status: true } }))?.status ?? domain.status,
        format: responseOptions.format,
        result: data,
      })
    }
    runCrawler(domain.id, siteUrl).catch((error) => logError(error, "api.crawl.async"))

    return jsonResponse({
      id: domain.id,
      slug: `${domain.domain}--${domain.id}`,
      url: siteUrl,
      status: domain.status,
    }, 202)
  } catch (error) {
    if (error instanceof InvalidDomainError) return jsonError(error.message, 400)
    await logError(error, "api.crawl")
    return jsonError("Could not start the crawl.", 500)
  }
}
