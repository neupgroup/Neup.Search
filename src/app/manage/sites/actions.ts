"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import type { Page } from "../pages/actions"
import { logError } from "@/lib/logging"
import {
  cancelDomainCrawl,
  createDomainForCrawl,
  deleteManagedDomain,
  deleteDomainPages,
  getAllCrawlTargets,
  getManagedDomainById,
  getManagedDomains,
  getNeupbotDashboardStats,
  getPagesForDomain,
  InvalidDomainError,
  markDomainSummaryFailed,
  resumePendingCrawler,
  runCrawler,
  runJavascriptCrawler,
  summarizeDomain,
  type ManagedDomain,
} from "../../../../services/neupbot"

const DomainSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }),
  description: z.string().min(1, { message: "Description is required." }),
})

export type Site = ManagedDomain

export type PaginatedSites = {
  sites: Site[]
  lastVisibleId: string | null
}

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
    description: formData.get("description"),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  try {
    const { domain, siteUrl } = await createDomainForCrawl(validatedFields.data)
    runCrawler(domain.id, siteUrl).catch((error) => logError(error, "crawlSite_async"))
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

  revalidatePath("/manage/sites")
  redirect("/manage/sites")
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
    await markDomainSummaryFailed(siteId)
  } finally {
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/sites")
  }
}

export async function getSites(search?: string, startAfterDocId?: string): Promise<PaginatedSites> {
  try {
    return await getManagedDomains(search, startAfterDocId)
  } catch (error) {
    await logError(error, "getSites")
    return { sites: [], lastVisibleId: null }
  }
}

export async function crawlSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  const siteUrl = formData.get("siteUrl") as string

  await runCrawler(siteId, siteUrl)
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/sites")
  revalidatePath("/manage/pages")
}

export async function crawlJavascriptSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  const siteUrl = formData.get("siteUrl") as string

  await runJavascriptCrawler(siteId, siteUrl)
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/sites")
  revalidatePath("/manage/pages")
}

export async function resumePendingCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string

  if (!siteId) {
    throw new Error("siteId is required.")
  }

  await resumePendingCrawler(siteId)
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/sites")
  revalidatePath("/manage/pages")
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
    const site = await getManagedDomainById(siteId)
    if (!site) return null

    return {
      status: site.status,
      lastCrawled: site.lastCrawled,
      pagesCrawled: site.pagesCrawled ?? 0,
      internalResourcesFound: site.internalResourcesFound ?? 0,
      externalResourcesFound: site.externalResourcesFound ?? 0,
      currentlyCrawling: site.currentlyCrawling,
      currentCrawlUrl: site.currentCrawlUrl,
      createdAt: site.createdAt.toISOString(),
    }
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
    revalidatePath("/manage/sites")
  } catch (error) {
    await logError(error, "cancelCrawl")
  }
}

export async function deletePagesForSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
    await deleteDomainPages(siteId)
    revalidatePath(`/manage/sites/${siteId}`)
    revalidatePath("/manage/sites")
    revalidatePath("/manage/pages")
  } catch (error) {
    await logError({ error, siteId }, "deletePagesForSite")
    throw new Error("Could not delete pages for site.")
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

  revalidatePath("/manage/sites")
  revalidatePath("/manage/pages")
  redirect("/manage/sites")
}

export async function deleteLinksForPage() {
  return
}

export async function crawlAllSites() {
  try {
    const domains = await getAllCrawlTargets()
    for (const domain of domains) {
      runCrawler(domain.id, domain.domain).catch((error) => logError(error, "crawlAllSites_async"))
    }
  } catch (error) {
    await logError(error, "crawlAllSites")
  } finally {
    revalidatePath("/manage/sites")
  }
}
