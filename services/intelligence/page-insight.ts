import { categorizePage } from "@/services/intelligence/categorize"
import { summarizePage } from "@/services/intelligence/summarize"

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

// Generate a page summary and site-aware category; a site category is required for page insights.
export async function generatePageInsight(input: GeneratePageInsightInput): Promise<PageInsight> {
  if (!input.siteCategory.trim()) {
    throw new Error("The site's category must be defined before generating page insights.")
  }

  const [summaryResult, categoryResult] = await Promise.allSettled([
    summarizePage(input.pageContent),
    categorizePage({
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      pageContent: input.pageContent,
      siteCategory: input.siteCategory,
      onGenericDetected: input.onGenericDetected,
    }),
  ])

  if (summaryResult.status === "rejected") throw summaryResult.reason
  if (categoryResult.status === "rejected") {
    return { summary: summaryResult.value, category: null, categorizationError: categoryResult.reason }
  }

  return { summary: summaryResult.value, category: categoryResult.value }
}
