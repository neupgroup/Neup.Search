import { RequestTimeoutError } from "@/services/intelligence/request-timeout"
import { logError } from "@/lib/logica-logging"
import { prisma } from "@/lib/prisma"
import { generateSiteBasics, type SiteBasics, type SiteProfileContext } from "@/services/intelligence/site-profile-generation"

export type { SiteBasics } from "@/services/intelligence/site-profile-generation"

export type GetBasicsInput = SiteProfileContext & { siteId: string }

// Analyze homepage details with AI and persist the site's name, branding, summary, and category.
export async function getBasics(input: GetBasicsInput): Promise<SiteBasics | null> {
  try {
    const project = await prisma.domain.findUnique({ where: { id: input.siteId }, select: { name: true, details: true } })
    if (!project) return null

    const basics = await generateSiteBasics(input)
    const existingDetails = project.details && typeof project.details === "object" && !Array.isArray(project.details)
      ? project.details as Record<string, unknown>
      : {}

    await prisma.domain.update({
      where: { id: input.siteId },
      data: {
        name: basics.name || project.name,
        categories: basics.category,
        details: {
          ...existingDetails,
          ...(basics.summary ? { summary: basics.summary } : {}),
          siteProfileGeneratedAt: new Date().toISOString(),
          ...(basics.logoUrl ? { logoUrl: basics.logoUrl } : {}),
          ...((basics.faviconUrl || basics.logoUrl) ? { appIconUrl: basics.faviconUrl || basics.logoUrl } : {}),
        },
      },
    })

    return basics
  } catch (error) {
    if (error instanceof RequestTimeoutError) throw error
    await logError({ error, siteId: input.siteId, siteUrl: input.siteUrl }, "getBasics")
    return null
  }
}
