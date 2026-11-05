import * as cheerio from "cheerio"
import { crawlPageToHtml } from "@/services/crawl/html"

export type MarkdownExtraction = {
  url: string
  title: string
  html: string
  markdown: string
  statusCode?: number | null
}

export type CrawlMarkdownOptions = {
  javascriptEnabled?: boolean
  timeoutMs?: number
  userAgent?: string
}

type MarkdownContext = {
  $: cheerio.CheerioAPI
  baseUrl: string
  listDepth: number
  listIndex?: number
}

// Resolve relative resource links while preserving their query strings and fragments.
function resolveUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized || normalized.startsWith("#") || /^(javascript|data|blob):/i.test(normalized)) return null

  try {
    return new URL(normalized, baseUrl).toString()
  } catch {
    return null
  }
}

// Select the largest useful candidate from a responsive image srcset.
function getSrcsetCandidate(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined
  const candidates = srcset.split(",").map((candidate) => {
    const [url, descriptor = ""] = candidate.trim().split(/\s+/, 2)
    const amount = Number.parseFloat(descriptor)
    const score = descriptor.endsWith("w") ? amount : descriptor.endsWith("x") ? amount * 1000 : 0
    return { url, score }
  }).filter((candidate) => candidate.url)

  return candidates.sort((left, right) => right.score - left.score)[0]?.url
}

// Find image URLs in standard and commonly used lazy-loading attributes.
function getImageUrl(element: cheerio.Element, $: cheerio.CheerioAPI, baseUrl: string): string | null {
  const image = $(element)
  const source = image.attr("src")
    || image.attr("data-src")
    || image.attr("data-lazy-src")
    || image.attr("data-original")
    || getSrcsetCandidate(image.attr("srcset"))
    || getSrcsetCandidate(image.attr("data-srcset"))

  return resolveUrl(source, baseUrl)
}

// Escape Markdown text without altering its meaningful inline formatting.
function escapeMarkdownText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1").replace(/\|/g, "\\|")
}

// Escape Markdown destinations that contain whitespace or parentheses.
function formatDestination(value: string): string {
  return value.replace(/\\/g, "%5C").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20")
}

// Convert inline DOM nodes into Markdown while preserving links and emphasis.
function renderInline(node: cheerio.AnyNode, context: MarkdownContext): string {
  const { $ } = context
  if (node.type === "text") return escapeMarkdownText((node as cheerio.Text).data || "")
  if (node.type !== "tag" && node.type !== "root") return ""

  const element = node as cheerio.Element
  const tag = element.tagName.toLowerCase()
  const children = () => (element.children || []).map((child) => renderInline(child, context)).join("")
  const content = children()

  if (["script", "style", "noscript", "template", "svg", "canvas"].includes(tag)) return ""
  if (tag === "br") return "  \n"
  if (tag === "img") return renderImage(element, context)
  if (tag === "a") {
    const href = resolveUrl($(element).attr("href"), context.baseUrl)
    const label = content.trim() || $(element).attr("aria-label") || $(element).attr("title") || href
    if (!href) return label || ""
    const linkedImage = $(element).find("img").first()
    if (linkedImage.length) {
      const imageMarkdown = renderImage(linkedImage.get(0)!, context)
      return `[${imageMarkdown}](${formatDestination(href)})`
    }
    return `[${label}](${formatDestination(href)})`
  }
  if (["strong", "b"].includes(tag)) return content.trim() ? `**${content.trim()}**` : ""
  if (["em", "i", "cite", "dfn"].includes(tag)) return content.trim() ? `*${content.trim()}*` : ""
  if (["del", "s", "strike"].includes(tag)) return content.trim() ? `~~${content.trim()}~~` : ""
  if (["code", "kbd", "samp"].includes(tag) && !$(element).parents("pre").length) {
    return content.trim() ? `\`${content.replace(/`/g, "\\`").trim()}\`` : ""
  }
  if (["sub", "sup"].includes(tag)) return content
  if (["video", "audio", "iframe", "embed", "object"].includes(tag)) return renderMedia(element, context)
  return content
}

// Convert an image and its alt text into absolute Markdown image syntax.
function renderImage(element: cheerio.Element, context: MarkdownContext): string {
  const { $, baseUrl } = context
  const image = $(element)
  const url = getImageUrl(element, $, baseUrl)
  if (!url) return ""
  const alt = escapeMarkdownText(image.attr("alt") || image.attr("aria-label") || "")
  return `![${alt}](${formatDestination(url)})`
}

// Extract a direct or nested media URL and expose it as a readable Markdown link.
function renderMedia(element: cheerio.Element, context: MarkdownContext): string {
  const { $, baseUrl } = context
  const media = $(element)
  const tag = element.tagName.toLowerCase()
  const source = media.attr("src")
    || media.attr("data-src")
    || media.find("source[src], source[data-src]").first().attr("src")
    || media.find("source[data-src]").first().attr("data-src")
  const url = resolveUrl(source, baseUrl)
  if (!url) return ""
  const label = tag === "audio" ? "Audio" : tag === "video" ? "Video" : "Embedded content"
  return `[${label}](${formatDestination(url)})`
}

// Convert a block node into structured Markdown, including nested lists and tables.
function renderBlock(node: cheerio.AnyNode, context: MarkdownContext): string {
  const { $ } = context
  if (node.type === "text") return escapeMarkdownText((node as cheerio.Text).data || "").trim()
  if (node.type !== "tag" && node.type !== "root") return ""

  const element = node as cheerio.Element
  const tag = element.tagName.toLowerCase()
  const wrapped = $(element)
  if (["script", "style", "noscript", "template", "nav", "header", "footer", "aside", "svg", "canvas"].includes(tag)) return ""
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    const heading = renderInline(element, context).trim()
    return heading ? `${"#".repeat(level)} ${heading}` : ""
  }
  if (tag === "p") return renderInline(element, context).trim()
  if (tag === "figure") return renderFigure(element, context)
  if (tag === "img") return renderImage(element, context)
  if (["video", "audio", "iframe", "embed", "object"].includes(tag)) return renderMedia(element, context)
  if (tag === "blockquote") {
    const quote = renderChildrenAsBlocks(element, context)
    return quote ? quote.split("\n").map((line) => `> ${line}`).join("\n") : ""
  }
  if (tag === "pre") {
    const code = wrapped.find("code").first()
    const languageClass = code.attr("class") || ""
    const language = languageClass.match(/(?:^|\s)(?:language|lang)-([\w+-]+)/)?.[1] || ""
    const content = code.length ? code.text() : wrapped.text()
    return `\`\`\`${language}\n${content.replace(/\s+$/, "")}\n\`\`\``
  }
  if (tag === "ul" || tag === "ol") return renderList(element, context)
  if (tag === "table") return renderTable(element, context)
  if (tag === "hr") return "---"
  if (tag === "br") return ""
  if (tag === "dl") return renderDefinitionList(element, context)
  if (["main", "article", "section", "div", "body", "html", "root", "details", "summary"].includes(tag)) {
    return renderChildrenAsBlocks(element, context)
  }

  const inline = renderInline(element, context).trim()
  return inline
}

// Render figure content and keep its caption immediately below its media.
function renderFigure(element: cheerio.Element, context: MarkdownContext): string {
  const { $ } = context
  const figure = $(element)
  const parts: string[] = []
  figure.children().each((_, child) => {
    if ((child as cheerio.Element).tagName?.toLowerCase() === "figcaption") return
    const block = renderBlock(child, context)
    if (block.trim()) parts.push(block.trim())
  })
  const caption = figure.children("figcaption").first().text().trim()
  if (caption) parts.push(`*Caption: ${escapeMarkdownText(caption)}*`)
  return parts.join("\n\n")
}

// Render ordered and unordered list items while retaining nested list indentation.
function renderList(element: cheerio.Element, context: MarkdownContext): string {
  const { $ } = context
  const list = $(element)
  const ordered = element.tagName.toLowerCase() === "ol"
  const startValue = Number.parseInt(list.attr("start") || "1", 10)
  const rows: string[] = []

  list.children("li").each((index, item) => {
    const itemElement = item as cheerio.Element
    const nestedLists = $(itemElement).children("ul, ol").toArray()
    const inlineContent = $(itemElement).contents().toArray()
      .filter((child) => !nestedLists.includes(child as cheerio.Element))
      .map((child) => child.type === "tag" && ["p", "div"].includes((child as cheerio.Element).tagName)
        ? renderInline(child, context).trim()
        : renderBlock(child, { ...context, listDepth: context.listDepth + 1 }).trim())
      .filter(Boolean)
      .join(" ")
    const marker = ordered ? `${startValue + index}.` : "-"
    const indent = "  ".repeat(context.listDepth)
    if (inlineContent) rows.push(`${indent}${marker} ${inlineContent}`)
    nestedLists.forEach((nestedList) => {
      const nestedMarkdown = renderList(nestedList as cheerio.Element, { ...context, listDepth: context.listDepth + 1 })
      if (nestedMarkdown) rows.push(nestedMarkdown)
    })
  })

  return rows.join("\n")
}

// Convert a table into a GitHub-Flavored Markdown table, retaining cell links and images.
function renderTable(element: cheerio.Element, context: MarkdownContext): string {
  const { $ } = context
  const rows = $(element).find("tr").toArray().map((row) => ({
    isHeader: $(row).children("th").length > 0,
    cells: $(row).children("th, td").toArray().map((cell) =>
      renderInline(cell, context).replace(/\s*\n\s*/g, " ").trim(),
    ),
  })).filter((row) => row.cells.length > 0)
  if (!rows.length) return ""

  const headerIndex = rows.findIndex((row) => row.isHeader)
  const normalizedRows = rows.map(({ cells }) => [...cells, ...Array(Math.max(0, ...rows.map((row) => row.cells.length)) - cells.length).fill("")])
  const columnCount = Math.max(...normalizedRows.map((row) => row.length))
  const selectedHeaderIndex = headerIndex >= 0 ? headerIndex : 0
  const header = normalizedRows[selectedHeaderIndex]
  const body = normalizedRows.filter((_, index) => index !== selectedHeaderIndex)
  const formatRow = (row: string[]) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`
  return [formatRow(header), formatRow(Array(columnCount).fill("---")), ...body.map(formatRow)].join("\n")
}

// Convert definition terms and descriptions into readable Markdown lines.
function renderDefinitionList(element: cheerio.Element, context: MarkdownContext): string {
  const { $ } = context
  const entries: string[] = []
  $(element).children().each((_, child) => {
    const tag = (child as cheerio.Element).tagName?.toLowerCase()
    const text = renderInline(child, context).trim()
    if (!text) return
    entries.push(tag === "dt" ? `**${text}**` : `: ${text}`)
  })
  return entries.join("\n")
}

// Render a node's direct children as separated Markdown blocks.
function renderChildrenAsBlocks(element: cheerio.Element, context: MarkdownContext): string {
  return (element.children || [])
    .map((child) => renderBlock(child, context).trim())
    .filter(Boolean)
    .join("\n\n")
}

// Convert HTML to a clean Markdown document, resolving all references against its page URL.
export function extractMarkdownFromHtml(html: string, pageUrl: string): MarkdownExtraction {
  const $ = cheerio.load(html)
  const baseHref = $("base[href]").first().attr("href")
  const baseUrl = baseHref ? resolveUrl(baseHref, pageUrl) || pageUrl : pageUrl
  const title = $("title").first().text().trim() || $("h1").first().text().trim()
  const mainContent = $("article, main, [role='main']").first()
  const root = mainContent.length ? mainContent.get(0)! : $("body").get(0) || $.root().get(0)!

  $(root).find("[hidden], [aria-hidden='true'], script, style, noscript, template, nav, header, footer, aside").remove()
  $(root).find("*[style]").each((_, element) => {
    const style = ($(element).attr("style") || "").replace(/\s/g, "").toLowerCase()
    if (/display:none|visibility:hidden|opacity:0(?:;|$)/.test(style)) $(element).remove()
  })

  const markdown = renderChildrenAsBlocks(root, { $, baseUrl, listDepth: 0 })
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { url: pageUrl, title, html: $(root).html() || "", markdown }
}

// Fetch a webpage with Playwright and return its captured HTML and Markdown separately.
export async function crawlPageToMarkdown(url: string, options: CrawlMarkdownOptions = {}): Promise<MarkdownExtraction> {
  const page = await crawlPageToHtml(url, options)
  return { ...extractMarkdownFromHtml(page.html, page.url), statusCode: page.statusCode }
}
