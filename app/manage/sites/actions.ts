"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/projects/view"
import type { Page } from "../pages/actions"
import { logError } from "@/lib/logica-logging"
import {
  cancelDomainCrawl,
  pauseDomainCrawl,
  resumePausedDomainCrawl,
  deleteManagedDomain,
  getNeupbotDashboardStats,
  getPagesForDomain,
  resumePendingCrawler,
  type ManagedDomain,
} from "@/services/neupbot"
import { createDomainForCrawl } from "@/services/projects/create"
import { InvalidDomainError } from "@/services/projects/domain"
import { getManagedDomainById, getManagedDomainCrawlStatus } from "@/services/projects/view"
import { markDomainSummaryFailed, summarizeDomain } from "@/services/projects/update"

const DomainSchema = z.object({
  url: z.string()
    .trim()
    .min(1, { message: "Please enter a domain." })
    .transform((value) => normalizeDomainInput(value))
})

function normalizeDomainInput(input: string) {
  const withoutProtocol = input.trim().replace(/^https?:\/\//i, "")
  const host = withoutProtocol.split(/[/?#]/, 1)[0].trim()
  return `https://${host}`
}

export type Site = ManagedDomain

export type PaginatedSitePages = {
  pages: Page[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export async function addSite(prevState: any, formData: FormData) {
  const validatedFields = DomainSchema.safeParse({
    url: formData.get("url"),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  let createdDomainId = ""

  try {
    const { domain } = await createDomainForCrawl({ url: validatedFields.data.url })
    createdDomainId = domain.id
  } catch (error) {
    if (error instanceof InvalidDomainError) {
      return {
        errors: { url: [error.message] },
      }
    }

    await logError(error, "addSite")
    return {
      errors: { _server: ["Could not add domain. Please try again."] },
    }
  }

  revalidatePath("/manage/projects")
  redirect(`/manage/projects?property=${encodeURIComponent(createdDomainId)}`)
}

export async function summarizeSiteAction(formData: FormData) {
  const siteId = formData.get("siteId") as string
  const siteUrl = formData.get("siteUrl") as string

  if (!siteId || !siteUrl) {
    throw new Error("siteId and siteUrl are required.")
  }

  try {
    await summarizeDomain(siteId, siteUrl)
  } catch (error) {
    await logError(error, "summarizeSiteAction")
    await markDomainSummaryFailed(siteId, error)
  } finally {
    revalidatePath(`/manage/sites/${siteId}`)
  }
}

export async function resumePendingCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string

  if (!siteId) {
    throw new Error("siteId is required.")
  }

  await resumePendingCrawler(siteId)
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/discovery/pages")
}

// Pause the site and prevent its crawl and analysis jobs from running.
export async function pauseSiteCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  await pauseDomainCrawl(siteId)
  revalidatePath("/manage/sites")
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/discovery/pages")
}

// Resume the site and queue any pages discovered while it was paused.
export async function resumePausedSiteCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  await resumePausedDomainCrawl(siteId)
  revalidatePath("/manage/sites")
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/discovery/pages")
}

export async function getSiteById(siteId: string): Promise<Site | null> {
  try {
    return await getManagedDomainById(siteId)
  } catch (error) {
    await logError(error, "getSiteById")
    return null
  }
}

export async function getSiteCrawlStatus(siteId: string) {
  try {
    return await getManagedDomainCrawlStatus(siteId)
  } catch (error) {
    await logError({ error, siteId }, "getSiteCrawlStatus")
    return null
  }
}

export async function getPagesForSite(siteId: string, page?: number, pageSize?: number): Promise<PaginatedSitePages> {
  try {
    return await getPagesForDomain(siteId, page, pageSize)
  } catch (error) {
    await logError(error, "getPagesForSite")
    return { pages: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 1 }
  }
}

export async function getDashboardStats() {
  try {
    return await getNeupbotDashboardStats()
  } catch (error) {
    await logError(error, "getDashboardStats")
    return { totalSites: 0, totalPages: 0, activeCrawls: 0, crawlErrors: 0 }
  }
}

export async function cancelCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
    await cancelDomainCrawl(siteId)
    revalidatePath(`/manage/sites/${siteId}`)
  } catch (error) {
    await logError(error, "cancelCrawl")
  }
}

export async function deleteSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
    await deleteManagedDomain(siteId)
  } catch (error) {
    await logError({ error, siteId }, "deleteSite")
    throw new Error("Could not delete site.")
  }

  revalidatePath("/manage/discovery/pages")
  revalidatePath("/manage/projects")
  redirect("/manage/projects")
}

export async function deleteLinksForPage() {
  return
}

// Save the selected site's category and homepage crawl preferences.
export async function saveSiteEnhancements(formData: FormData) {
  const siteId = String(formData.get("siteId") || "")
  const categoryValue = String(formData.get("category") || "")
  const homepageTitle = String(formData.get("homepageTitle") || "").trim()
  const javascriptMode = String(formData.get("javascriptMode") || "")

  const parsed = z.object({
    siteId: z.string().min(1),
    category: z.string().max(256),
    homepageTitle: z.string().max(256),
    javascriptMode: z.enum(["required", "not-required"]),
  }).safeParse({ siteId, category: categoryValue, homepageTitle, javascriptMode })

  if (!parsed.success) throw new Error("Invalid site enhancement settings.")

  if (parsed.data.category && !await prisma.category.findFirst({ where: { type: "site", name: parsed.data.category }, select: { id: true } })) {
    throw new Error("Choose an existing site category.")
  }

  const existing = await prisma.domain.findUnique({ where: { id: siteId }, select: { details: true } })
  if (!existing) throw new Error("Site not found.")
  const details = readDetails(existing.details)

  await prisma.domain.update({
    where: { id: siteId },
    data: {
      categories: parsed.data.category || null,
      details: {
        ...details,
        homepageTitle: parsed.data.homepageTitle,
        javascriptMode: parsed.data.javascriptMode,
      },
    },
  })

  revalidatePath("/manage/enhancements/site")
  revalidatePath("/manage/discovery/pages")
}
