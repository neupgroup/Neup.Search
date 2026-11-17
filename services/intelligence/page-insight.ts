import { createNiaResponse } from "@neup/logica/intelligence/responses"
import { getCategorizationContext, getGenericPageCategories } from "@/services/intelligence/categorization-context"
import { getSummarizationContext } from "@/services/intelligence/summarization-context"

export type GeneratePageInsightInput = {
  pageUrl: string
  pageTitle: string
  pageContent: string
  siteCategory: string
  onGenericDetected?: () => Promise<void>
}

export type PageInsight = {
  summary: string
  category: string | null
  categorizationError?: unknown
}

// Generate a page summary and site-aware category in one JSON intelligence request.
export async function generatePageInsight(input: GeneratePageInsightInput): Promise<PageInsight> {
  if (!input.siteCategory.trim()) {
    throw new Error("The site's category must be defined before generating page insights.")
  }

  const categoryOptions = getCategorizationContext(input.siteCategory)
  const response = await createNiaResponse({
    model: "auto",
    input: [
      {
        type: "text",
        role: "system",
        text: [
          "Analyze this webpage and return JSON only with keys summary and category.",
          "Write a plain-language summary of at most 50 words stating the page purpose and key points.",
          "Choose exactly one category from the supplied allowed categories.",
          'If the page is generic, set category to "generic". If no category fits, set it to "not-any".',
          `When category is generic, also choose genericCategory from: ${getGenericPageCategories().join(", ")}.`,
          `Allowed categories: ${categoryOptions.join(", ")}.`,
        ].join(" "),
      },
      {
        type: "text",
        role: "user",
        text: [`Page URL: ${input.pageUrl}`, `Page title: ${input.pageTitle}`, `Page content:\n${getSummarizationContext(input.pageContent)}`].join("\n\n"),
      },
    ],
  })
  const responseText = response.data.output.map((item) => item.value).join("\n").trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  const parsed = JSON.parse(responseText) as { summary?: unknown; category?: unknown; genericCategory?: unknown }
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().split(/\s+/).slice(0, 50).join(" ") : ""
  if (!summary) throw new Error("Logica Assist returned an empty summary.")

  let category = typeof parsed.category === "string" && categoryOptions.includes(parsed.category) ? parsed.category : null
  if (parsed.category === "generic") {
    await input.onGenericDetected?.()
    const genericOptions = getGenericPageCategories()
    category = typeof parsed.genericCategory === "string" && genericOptions.includes(parsed.genericCategory)
      ? `generic.${parsed.genericCategory}`
      : "generic"
  }
  if (parsed.category === "not-any") category = null
  return { summary, category }
}
