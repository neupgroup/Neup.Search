import { createNiaResponse } from "@neup/logica/intelligence/responses"
import { getCategorizationContext, getGenericPageCategories } from "@/services/intelligence/categorization-context"
import { getSummarizationContext } from "@/services/intelligence/summarization-context"
import { withRequestTimeout } from "@/services/intelligence/request-timeout"

export type GeneratePageInsightInput = {
  pageUrl: string
  pageTitle: string
  pageContent: string
  siteCategory: string | null
}

export type PageInsight = {
  summary: string
  category: string | null
}

// Generate a page summary and site-aware category in one JSON intelligence request.
export async function generatePageInsight(input: GeneratePageInsightInput): Promise<PageInsight> {
  const categoryOptions = getCategorizationContext(input.siteCategory)
  const response = await withRequestTimeout(createNiaResponse({
    model: "auto",
    input: [
      {
        type: "text",
        role: "system",
        text: [
          "Analyze this webpage and return valid JSON only with keys summary, category, and genericCategory.",
          "Write a plain-language summary of at most 50 words stating the page purpose and key points.",
          categoryOptions.some((category) => category !== "generic")
            ? "Choose exactly one category from the supplied allowed categories."
            : "The site's category is unknown, so choose a generic page category from the supplied allowed categories when one fits.",
          'Set category to "generic" for general pages, or "not-any" only if the page cannot be classified.',
          `When category is generic, genericCategory must be exactly one of: ${getGenericPageCategories().join(", ")}.`,
          `Allowed categories: ${categoryOptions.join(", ")}.`,
          "Do not include markdown fences or any text outside the JSON object.",
        ].join(" "),
      },
      {
        type: "text",
        role: "user",
        text: [`Page URL: ${input.pageUrl}`, `Page title: ${input.pageTitle}`, `Page content:\n${getSummarizationContext(input.pageContent)}`].join("\n\n"),
      },
    ],
  }), "Page insight request")
  const responseText = response.data.output.map((item) => item.value).join("\n").trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  const parsed = JSON.parse(responseText) as { summary?: unknown; category?: unknown; genericCategory?: unknown }
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().split(/\s+/).slice(0, 50).join(" ") : ""
  if (!summary) throw new Error("Logica Assist returned an empty summary.")

  let category = typeof parsed.category === "string" && categoryOptions.includes(parsed.category) ? parsed.category : null
  if (parsed.category === "generic") {
    const genericOptions = getGenericPageCategories()
    category = typeof parsed.genericCategory === "string" && genericOptions.includes(parsed.genericCategory)
      ? `generic.${parsed.genericCategory}`
      : null
  } else if (typeof parsed.category === "string" && getGenericPageCategories().includes(parsed.category)) {
    category = `generic.${parsed.category}`
  }
  if (parsed.category === "not-any") category = null
  if (!category && parsed.category !== "not-any") {
    throw new Error(`Logica Assist returned an invalid page category: ${String(parsed.category)}`)
  }
  return { summary, category }
}
