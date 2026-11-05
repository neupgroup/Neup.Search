import * as cheerio from "cheerio"

export type CrawlLinkPayload = {
  text: string
  link: string
}

const absoluteUrlAttributes = [
  "href",
  "src",
  "poster",
  "action",
  "formaction",
  "cite",
  "background",
  "data",
  "codebase",
  "manifest",
  "usemap",
  "data-src",
  "data-lazy-src",
  "data-original",
  "xlink:href",
] as const

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

// Resolve a URL-valued HTML attribute while preserving non-web schemes.
function resolveHtmlAttribute(value: string, pageUrl: string): string {
  const normalized = value.trim()
  if (!normalized || /^(data|blob|javascript|mailto|tel):/i.test(normalized)) return value
  return resolveLinkUrl(normalized, pageUrl) || value
}

// Resolve every URL-bearing attribute and CSS URL in HTML against its final page URL.
export function makeHtmlLinksAbsolute(html: string, pageUrl: string): string {
  const $ = cheerio.load(html)
  $("*").each((_, element) => {
    const node = $(element)
    for (const attribute of absoluteUrlAttributes) {
      const value = node.attr(attribute)
      if (value) node.attr(attribute, resolveHtmlAttribute(value, pageUrl))
    }

    for (const attribute of ["srcset", "data-srcset"]) {
      const srcset = node.attr(attribute)
      if (!srcset) continue
      const fixedSrcset = srcset.split(",").map((candidate) => {
        const [url, ...descriptor] = candidate.trim().split(/\s+/)
        return [resolveHtmlAttribute(url, pageUrl), ...descriptor].filter(Boolean).join(" ")
      }).join(", ")
      node.attr(attribute, fixedSrcset)
    }

    const style = node.attr("style")
    if (style) {
      node.attr("style", style.replace(/url\((['"]?)(.*?)\1\)/gi, (_match, quote: string, value: string) =>
        `url(${quote}${resolveHtmlAttribute(value, pageUrl)}${quote})`,
      ))
    }
  })

  $("style").each((_, element) => {
    const style = $(element).html() || ""
    $(element).html(style.replace(/url\((['"]?)(.*?)\1\)/gi, (_match, quote: string, value: string) =>
      `url(${quote}${resolveHtmlAttribute(value, pageUrl)}${quote})`,
    ))
  })

  $("meta[content]").each((_, element) => {
    const meta = $(element)
    const key = (meta.attr("property") || meta.attr("name") || "").toLowerCase()
    if (!/^(og:url|og:image|og:image:url|twitter:url|twitter:image)$/.test(key)) return
    const content = meta.attr("content")
    if (content) meta.attr("content", resolveHtmlAttribute(content, pageUrl))
  })

  return $.html()
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
