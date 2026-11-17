"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import type { Page } from "../pages/actions"
import { logError } from "@/lib/logica-logging"
import {
  cancelDomainCrawl,
  deleteManagedDomain,
  deleteDomainPages,
  getNeupbotDashboardStats,
  getPagesForDomain,
  resumePendingCrawler,
  queueDomainCrawl,
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

export async function crawlSite(formData: FormData) {
  const siteId = formData.get("siteId") as string

  await queueDomainCrawl(siteId, true)
  revalidatePath(`/manage/sites/${siteId}`)
  revalidatePath("/manage/pages")
}

export async function resumePendingCrawl(formData: FormData) {
  const siteId = formData.get("siteId") as string

  if (!siteId) {
    throw new Error("siteId is required.")
  }

  await resumePendingCrawler(siteId)
  revalidatePath(`/manage/sites/${siteId}`)
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

export async function deletePagesForSite(formData: FormData) {
  const siteId = formData.get("siteId") as string
  if (!siteId) throw new Error("siteId is required.")

  try {
    await deleteDomainPages(siteId)
    revalidatePath(`/manage/sites/${siteId}`)
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

  revalidatePath("/manage/pages")
  revalidatePath("/manage/projects")
  redirect("/manage/projects")
}

export async function deleteLinksForPage() {
  return
}
