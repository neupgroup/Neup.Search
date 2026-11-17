import { createNiaResponse } from "@neup/logica/intelligence/responses"
import categoryTree from "@/services/categories/categories.json"

type CategoryTree = Record<string, unknown>

export type CategorizePageInput = {
  pageUrl: string
  pageTitle: string
  pageContent: string
  siteCategory: string | null
  onGenericDetected?: () => Promise<void>
}

// Collect leaf page names when the saved site category is a taxonomy root.
function collectPageCategoryLeaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string")
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(collectPageCategoryLeaves)
}

// Read the page category leaves associated with the site's saved category path.
function getSitePageCategories(siteCategory: string | null): string[] {
  if (!siteCategory) return []
  const path = siteCategory.split(".").filter(Boolean)
  if (path[0] === "generic") return []
  let value: unknown = categoryTree as CategoryTree

  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !(key in value)) return []
    value = (value as Record<string, unknown>)[key]
  }

  return collectPageCategoryLeaves(value)
}

// Ask the model to choose one allowed page category from the supplied choices.
async function choosePageCategory(pageUrl: string, pageTitle: string, pageContent: string, choices: string[]): Promise<string | null> {
  if (choices.length === 0) return null
  const response = await createNiaResponse({
    model: "auto",
    input: [
      {
        type: "text",
        role: "system",
        text: [
          "Classify what this webpage is about based on its URL, title, and content.",
          'Return JSON only in the form {"category":"value"}.',
          "Choose exactly one value from the supplied choices. If none fits, return category as not-any.",
          `Allowed categories: ${choices.join(", ")}.`,
        ].join(" "),
      },
      {
        type: "text",
        role: "user",
        text: [`Page URL: ${pageUrl}`, `Page title: ${pageTitle}`, `Page content:\n${pageContent.slice(0, 12_000)}`].join("\n\n"),
      },
    ],
  })

  const responseText = response.data.output.map((item) => item.value).join("\n").trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  const parsed = JSON.parse(responseText) as { category?: unknown }
  return typeof parsed.category === "string" && choices.includes(parsed.category) ? parsed.category : null
}

// Classify a page against its site's category; generic pages receive a generic leaf classification.
export async function categorizePage(input: CategorizePageInput): Promise<string | null> {
  const siteCategories = getSitePageCategories(input.siteCategory)
  const initialCategory = await choosePageCategory(
    input.pageUrl,
    input.pageTitle,
    input.pageContent,
    [...new Set([...siteCategories, "generic"])],
  )

  if (initialCategory !== "generic") return initialCategory

  await input.onGenericDetected?.()
  const genericCategories = (categoryTree as CategoryTree).generic
  if (!Array.isArray(genericCategories)) return "generic"

  const genericPageCategory = await choosePageCategory(
    input.pageUrl,
    input.pageTitle,
    input.pageContent,
    genericCategories.filter((entry): entry is string => typeof entry === "string"),
  )
  return genericPageCategory ? `generic.${genericPageCategory}` : "generic"
}
