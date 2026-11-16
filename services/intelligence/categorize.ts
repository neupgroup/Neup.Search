import { createNiaResponse } from "@neup/logica/intelligence/responses"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logica-logging"

type CategorizeSiteInput = {
  siteId: string
  siteUrl: string
  homepageContent: string
}

// Read one category label from the model response, returning null when no category was found.
function readCategory(responseText: string): string | null {
  const normalizedText = responseText.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  if (!normalizedText || /^(null|none|unknown|n\/a)$/i.test(normalizedText)) return null

  try {
    const parsed = JSON.parse(normalizedText) as string | null | { category?: unknown }
    const candidate = typeof parsed === "string"
      ? parsed
      : parsed && typeof parsed === "object" && typeof parsed.category === "string"
        ? parsed.category
        : null
    return candidate?.trim() || null
  } catch {
    return normalizedText.replace(/^['"]|['"]$/g, "").trim() || null
  }
}

// Categorize a site's homepage and store a new category on its project record.
export async function categorizeSite({ siteId, siteUrl, homepageContent }: CategorizeSiteInput): Promise<string | null> {
  try {
    const project = await prisma.domain.findUnique({ where: { id: siteId }, select: { categories: true } })
    if (!project) return null
    if (project.categories.length > 0) return project.categories[0]

    const response = await createNiaResponse({
      model: "auto",
      input: [
        {
          type: "text",
          role: "system",
          text: "Identify the single best high-level category for this website from its URL and homepage content. Return JSON only as {\"category\":\"category name\"}. If the site has no clear category, return {\"category\":null}.",
        },
        { type: "text", role: "user", text: `Site URL: ${siteUrl}\n\nHomepage content:\n${homepageContent.slice(0, 16_000)}` },
      ],
    })
    const category = readCategory(response.data.output.map((item) => item.value).join("\n"))
    if (!category) return null

    await prisma.domain.update({ where: { id: siteId }, data: { categories: { push: category } } })
    return category
  } catch (error) {
    await logError({ error, siteId, siteUrl }, "categorizeSite")
    return null
  }
}
