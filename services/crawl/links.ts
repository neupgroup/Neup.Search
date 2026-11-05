import * as cheerio from "cheerio"

export type CrawlLinkPayload = {
  text: string
  link: string
}

// Resolve a page link to an absolute HTTP(S) URL.
function resolveLinkUrl(value: string, pageUrl: string): string | null {
  const normalized = value.trim()
  if (!normalized || /^(javascript|data|blob):/i.test(normalized)) return null

  try {
    const url = new URL(normalized, pageUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

// Extract the rendered page's links as the API response payload.
export function extractPageLinksFromHtml(html: string, pageUrl: string): CrawlLinkPayload[] {
  const $ = cheerio.load(html)
  return $("a[href]").toArray().flatMap((element) => {
    const link = resolveLinkUrl($(element).attr("href") || "", pageUrl)
    if (!link) return []

    const text = $(element).text().replace(/\s+/g, " ").trim()
      || $(element).find("img[alt]").first().attr("alt")?.trim()
      || $(element).attr("aria-label")?.trim()
      || ""

    return [{ text, link }]
  })
}
