"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logging"
import { revalidatePath } from "next/cache"
import { summarizePageContent } from "@/ai/flows/summarize-page-flow"
import type { Prisma } from "@prisma/client"

export type Page = {
  id: string
  url: string
  title: string
  siteUrl: string
  status: "Indexed" | "Error" | "Pending" | "Skipped" | "Redirect"
  statusCode: number | null
  lastIndexed: string | null
  createdAt: Date
  description?: string
  summary?: string
  content?: string
}

export type Backlink = {
  id: string
  sourceUrl: string
  sourceTitle: string
}

export type PaginatedPages = {
  pages: Page[]
  lastVisibleId: string | null
}

type PageRow = {
  id: string
  url: string
  title: string | null
  description: string | null
  status: string
  statusCode: number | null
  lastCrawled: Date | null
  addedOn: Date
  fullContent?: string | null
  data?: unknown
  domain: {
    domain: string
  }
}

function readSummary(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const summaryEntry = data.find((entry) => {
    return entry && typeof entry === "object" && "kind" in entry && entry.kind === "summary"
  })
  return summaryEntry && typeof summaryEntry === "object" && "summary" in summaryEntry && typeof summaryEntry.summary === "string"
    ? summaryEntry.summary
    : undefined
}

function mapPage(page: PageRow): Page {
  return {
    id: page.id,
    url: page.url,
    title: page.title || "No title",
    description: page.description || "No description",
    siteUrl: page.domain.domain,
    status: page.status as Page["status"],
    statusCode: page.statusCode,
    lastIndexed: page.lastCrawled ? page.lastCrawled.toLocaleDateString() : "Never",
    createdAt: page.addedOn,
    summary: readSummary(page.data),
    content: page.fullContent || undefined,
  }
}

export async function getPages(search?: string, startAfterDocId?: string): Promise<PaginatedPages> {
  try {
    const limit = 20
    const where = search
      ? {
          OR: [
            { url: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { fullContent: { contains: search, mode: "insensitive" as const } },
            { domain: { domain: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : undefined

    const rows = await prisma.page.findMany({
      where,
      orderBy: { addedOn: "desc" },
      take: search ? 1000 : limit,
      ...(startAfterDocId && !search ? { cursor: { id: startAfterDocId }, skip: 1 } : {}),
      include: { domain: { select: { domain: true } } },
    })

    const startIndex = search && startAfterDocId ? rows.findIndex((page) => page.id === startAfterDocId) + 1 : 0
    const slice = search ? rows.slice(Math.max(startIndex, 0), Math.max(startIndex, 0) + limit) : rows
    const pages = slice.map(mapPage)

    return {
      pages,
      lastVisibleId: (search ? rows.length > Math.max(startIndex, 0) + limit : pages.length === limit)
        ? pages[pages.length - 1]?.id || null
        : null,
    }
  } catch (error) {
    await logError(error, "getPages")
    return { pages: [], lastVisibleId: null }
  }
}

export async function getPageById(pageId: string): Promise<Page | null> {
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: { domain: { select: { domain: true } } },
    })

    return page ? mapPage(page) : null
  } catch (error) {
    await logError({ error, pageId }, "getPageById")
    return null
  }
}

export async function getBacklinks(pageUrl?: string): Promise<Backlink[]> {
  if (!pageUrl) return []

  try {
    const links = await prisma.link.findMany({
      where: { linkTo: pageUrl },
      orderBy: { firstCrawlOn: "desc" },
      select: {
        id: true,
        linkFrom: true,
      },
    })

    if (links.length === 0) return []

    const sourceUrls = [...new Set(links.map((link) => link.linkFrom))]
    const sourcePages = await prisma.page.findMany({
      where: { url: { in: sourceUrls } },
      select: {
        url: true,
        title: true,
      },
    })
    const sourceTitleByUrl = new Map(sourcePages.map((page) => [page.url, page.title || "No title"]))

    return links.map((link) => ({
      id: link.id,
      sourceUrl: link.linkFrom,
      sourceTitle: sourceTitleByUrl.get(link.linkFrom) || link.linkFrom,
    }))
  } catch (error) {
    await logError({ error, pageUrl }, "getBacklinks")
    return []
  }
}

export async function summarizePageAction(pageId: string, pageContent: string) {
  try {
    const { summary } = await summarizePageContent({ content: pageContent })
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { data: true },
    })
    const data = (Array.isArray(page?.data) ? page.data.filter((entry) => {
      return entry !== null && !(entry && typeof entry === "object" && "kind" in entry && entry.kind === "summary")
    }) : []) as Prisma.InputJsonValue[]

    await prisma.page.update({
      where: { id: pageId },
      data: {
        data: [
          ...data,
          {
            kind: "summary",
            summary,
            addedOn: new Date().toISOString(),
          },
        ],
      },
    })
  } catch (error) {
    await logError({ error, pageId }, "summarizePageAction")
  } finally {
    revalidatePath(`/manage/pages/${pageId}`)
  }
}
