import { createNiaResponse } from "@neup/logica/intelligence/responses"
import { withRequestTimeout } from "@/services/intelligence/request-timeout"
import categoryTree from "@/services/categories/categories.json"

export type SiteBasics = {
  name: string
  faviconUrl: string | null
  logoUrl: string | null
  summary: string
  category: string | null
}

export type SiteProfileContext = {
  siteUrl: string
  homepageName: string
  homepageContent: string
  renderedContent: string
}

type SiteCategoryTree = Record<string, unknown>

// Build allowed site categories from taxonomy branches, excluding page categories stored in leaf arrays.
export function getSiteCategoryOptions(tree: SiteCategoryTree): string[] {
  return Object.entries(tree).flatMap(([root, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [root]
    return [root, ...Object.entries(value).filter(([, child]) => child && typeof child === "object" && !Array.isArray(child)).map(([child]) => `${root}.${child}`)]
  })
}

// Parse the model's JSON response, accepting only the documented basic fields.
function parseSiteBasics(responseText: string, categoryOptions: string[], homepageName: string): SiteBasics {
  const cleaned = responseText.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  const parsed = JSON.parse(cleaned) as Record<string, unknown>
  const readString = (value: unknown) => typeof value === "string" ? value.trim() : ""
  const requestedCategory = readString(parsed.category)
  const category = requestedCategory === "not-any" ? null : categoryOptions.includes(requestedCategory) ? requestedCategory : null
  return {
    name: readString(parsed.name) || homepageName.trim(),
    faviconUrl: readString(parsed.faviconUrl) || null,
    logoUrl: readString(parsed.logoUrl) || null,
    summary: readString(parsed.summary),
    category,
  }
}

// Convert an AI-provided image URL into an absolute HTTP URL on the site's origin.
function normalizeSiteImageUrl(value: string | null, siteUrl: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, siteUrl)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

// Generate site basics without accessing the database so an analysis worker can submit them through the API.
export async function generateSiteBasics(input: SiteProfileContext): Promise<SiteBasics> {
  const categoryOptions = getSiteCategoryOptions(categoryTree as SiteCategoryTree)
  const response = await withRequestTimeout(createNiaResponse({
    model: "auto",
    input: [
      {
        type: "text",
        role: "system",
        text: [
          "Extract the site's basic information from its URL, homepage name, rendered homepage content, and text content.",
          "Return JSON only with keys name, faviconUrl, logoUrl, summary, and category.",
          "Use the homepage's actual site or brand name, not a page title when a clearer brand name is present.",
          "Prefer an explicit favicon URL from the rendered page. If no favicon is present, use the site's logo URL as faviconUrl when identifiable; also return logoUrl separately when available.",
          "Write a concise factual summary of the site.",
          `Choose exactly one category from this list: ${categoryOptions.join(", ")}.`,
          "These are site categories: a root key such as real-estate is valid, and a child such as real-estate.agent or real-estate.agency is valid.",
          "Do not choose leaf page categories such as home, about, or property-listing. Those describe pages, not sites.",
          "If no listed site category fits, return category exactly as not-any.",
          "Use null for faviconUrl or logoUrl when no suitable URL can be identified.",
        ].join(" "),
      },
      {
        type: "text",
        role: "user",
        text: [
          `Site URL: ${input.siteUrl}`,
          `Homepage name: ${input.homepageName}`,
          `Homepage content:\n${input.homepageContent.slice(0, 12_000)}`,
          `Rendered homepage content:\n${input.renderedContent.slice(0, 24_000)}`,
        ].join("\n\n"),
      },
    ],
  }), "Site profile request")

  const basics = parseSiteBasics(response.data.output.map((item) => item.value).join("\n"), categoryOptions, input.homepageName)
  return {
    ...basics,
    faviconUrl: normalizeSiteImageUrl(basics.faviconUrl, input.siteUrl),
    logoUrl: normalizeSiteImageUrl(basics.logoUrl, input.siteUrl),
  }
}
