

"use server"

import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/logging"
import { revalidatePath } from "next/cache"
import { summarizePageContent } from "@/ai/flows/summarize-page-flow"

export type Page = {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  status: "Indexed" | "Error" | "Pending";
  lastIndexed: string | null;
  createdAt: Date;
  description?: string;
  summary?: string;
  content?: string;
}

export type Backlink = {
    id: string;
    sourceUrl: string;
    sourceTitle: string;
}

export type PaginatedPages = {
    pages: Page[];
    lastVisibleId: string | null;
}

export async function getPages(search?: string, startAfterDocId?: string): Promise<PaginatedPages> {
    try {
        const LIMIT = 20;
        let pagesList: Page[] = [];
        let lastVisibleId: string | null = null;

        if (search) {
            const filtered = await prisma.page.findMany({
                where: {
                    OR: [
                        { url: { contains: search, mode: "insensitive" } },
                        { title: { contains: search, mode: "insensitive" } },
                        { description: { contains: search, mode: "insensitive" } },
                    ],
                },
                orderBy: { createdAt: "desc" },
                take: 1000,
                select: {
                    id: true, url: true, title: true, description: true, siteUrl: true, status: true, lastIndexed: true, createdAt: true
                }
            });
            let startIndex = 0;
            if (startAfterDocId) {
                const foundIndex = filtered.findIndex(p => p.id === startAfterDocId);
                if (foundIndex !== -1) startIndex = foundIndex + 1;
            }
            const slice = filtered.slice(startIndex, startIndex + LIMIT);
            pagesList = slice.map((p: { id: string; url: string; title: string | null; description: string | null; siteUrl: string | null; status: string; lastIndexed: Date | null; createdAt: Date; }) => ({
                id: p.id,
                url: p.url,
                title: p.title || 'No title',
                description: p.description || 'No description',
                siteUrl: p.siteUrl || '',
                status: p.status as any,
                lastIndexed: p.lastIndexed ? p.lastIndexed.toLocaleDateString() : 'Never',
                createdAt: p.createdAt,
            }));
            if (filtered.length > startIndex + LIMIT) {
                lastVisibleId = pagesList[pagesList.length - 1]?.id || null;
            }
        } else {
            const base = await prisma.page.findMany({
                orderBy: { createdAt: "desc" },
                take: LIMIT,
                ...(startAfterDocId
                    ? {
                        cursor: { id: startAfterDocId },
                        skip: 1,
                      }
                    : {}),
                select: {
                    id: true, url: true, title: true, description: true, siteUrl: true, status: true, lastIndexed: true, createdAt: true
                }
            });
            pagesList = base.map((p: { id: string; url: string; title: string | null; description: string | null; siteUrl: string | null; status: string; lastIndexed: Date | null; createdAt: Date; }) => ({
                id: p.id,
                url: p.url,
                title: p.title || 'No title',
                description: p.description || 'No description',
                siteUrl: p.siteUrl || '',
                status: p.status as any,
                lastIndexed: p.lastIndexed ? p.lastIndexed.toLocaleDateString() : 'Never',
                createdAt: p.createdAt,
            }));
            lastVisibleId = pagesList.length ? pagesList[pagesList.length - 1].id : null;
        }

        return {
            pages: pagesList,
            lastVisibleId,
        }
    } catch (error) {
        await logError(error, "getPages");
        return { pages: [], lastVisibleId: null };
    }
}

export async function getPageById(pageId: string): Promise<Page | null> {
    try {
        const p = await prisma.page.findUnique({ where: { id: pageId } });
        if (!p) return null;
        return {
            id: p.id,
            url: p.url,
            title: p.title || 'No title',
            description: p.description || undefined,
            summary: p.summary || undefined,
            content: p.content || undefined,
            siteUrl: p.siteUrl || '',
            status: p.status as any,
            lastIndexed: p.lastIndexed ? p.lastIndexed.toLocaleDateString() : 'Never',
            createdAt: p.createdAt,
        };
    } catch (error) {
        await logError({ error, pageId }, "getPageById");
        return null;
    }
}

export async function getBacklinks(pageUrl: string): Promise<Backlink[]> {
    try {
        const links = await prisma.link.findMany({
            where: { targetUrl: pageUrl },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: { id: true, sourceUrl: true, sourceTitle: true }
        });
        return links.map((l: { id: string; sourceUrl: string; sourceTitle: string | null; }) => ({
            id: l.id,
            sourceUrl: l.sourceUrl,
            sourceTitle: l.sourceTitle || l.sourceUrl
        }));
    } catch (error) {
        await logError({ error, pageUrl }, "getBacklinks");
        return [];
    }
}

export async function summarizePageAction(pageId: string, pageContent: string) {
    try {
        const { summary } = await summarizePageContent({ content: pageContent });
        await prisma.page.update({
            where: { id: pageId },
            data: { summary }
        });

    } catch (error) {
       await logError({ error, pageId }, "summarizePageAction");
    } finally {
        revalidatePath(`/manage/pages/${pageId}`);
    }
}
