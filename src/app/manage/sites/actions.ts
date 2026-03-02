

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import * as cheerio from "cheerio"
import { prisma } from "@/lib/prisma"
import type { Page, PaginatedPages } from "../pages/actions"
import { summarizeSite } from "@/ai/flows/summarize-site-flow"
import { logError } from "@/lib/logging"

const SiteSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }),
  description: z.string().min(1, { message: "Description is required." }),
})

export type Site = {
  id: string;
  url:string;
  description: string;
  status: "Pending" | "Active" | "Paused" | "Error" | "Crawling";
  lastCrawled: string | null;
  createdAt: Date;
  pagesCrawled?: number;
  currentlyCrawling?: string;
  name?: string;
  summary?: string;
  logoUrl?: string;
}

export type PaginatedSites = {
    sites: Site[];
    lastVisibleId: string | null;
}

export type PaginatedSitePages = {
    pages: Page[];
    lastVisibleId: string | null;
    firstVisibleId: string | null;
}

export async function addSite(prevState: any, formData: FormData) {
  const validatedFields = SiteSchema.safeParse({
    url: formData.get("url"),
    description: formData.get("description"),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const siteData = {
      siteId: '',
      siteUrl: validatedFields.data.url,
      description: validatedFields.data.description,
  }

  try {
    const newSite = await prisma.site.create({
      data: {
        url: siteData.siteUrl,
        description: siteData.description,
        status: "Pending",
        currentlyCrawling: "Summarizing site...",
      }
    });
    siteData.siteId = newSite.id;
  } catch (error) {
    await logError(error, "addSite");
    return {
      errors: { _server: ["Could not add site. Please try again."] },
    }
  }
  
  // Trigger summarization asynchronously (don't block the redirect)
  const formDataForSummary = new FormData()
  formDataForSummary.append('siteId', siteData.siteId)
  formDataForSummary.append('siteUrl', siteData.siteUrl)
  summarizeSiteAction(formDataForSummary).catch((e) => logError(e, "summarizeSiteAction_async"));

  revalidatePath("/manage/sites")
  redirect("/manage/sites")
}

export async function summarizeSiteAction(formData: FormData) {
    const siteId = formData.get("siteId") as string;
    const siteUrl = formData.get("siteUrl") as string;

    if (!siteId || !siteUrl) {
        throw new Error("siteId and siteUrl are required.");
    }

    try {
        await prisma.site.update({ where: { id: siteId }, data: { currentlyCrawling: "Summarizing site..." } });

        const summaryData = await summarizeSite({ url: siteUrl });
        
        await prisma.site.update({
          where: { id: siteId },
          data: {
            name: summaryData.name || null,
            summary: summaryData.summary || null,
            logoUrl: summaryData.logoUrl || null,
            currentlyCrawling: "",
          }
        });

    } catch (error) {
        await logError(error, "summarizeSiteAction");
        await prisma.site.update({
          where: { id: siteId },
          data: { currentlyCrawling: "Failed to summarize site.", status: "Error" }
        });
    } finally {
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
    }
}


export async function getSites(search?: string, startAfterDocId?: string): Promise<PaginatedSites> {
    try {
        let sitesList: Site[] = [];
        let lastVisibleId: string | null = null;
        const LMT = 20;

        if (search) {
            const filtered = await prisma.site.findMany({
              where: {
                OR: [
                  { url: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } },
                  { summary: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                ],
              },
              orderBy: { createdAt: "desc" },
              take: 1000,
            });
            let startIndex = 0;
            if (startAfterDocId) {
              const foundIndex = filtered.findIndex((s: { id: string }) => s.id === startAfterDocId);
              if (foundIndex !== -1) startIndex = foundIndex + 1;
            }
            const slice = filtered.slice(startIndex, startIndex + LMT);
            sitesList = slice.map((s: { id: string; url: string; description: string; status: string; lastCrawled: Date | null; createdAt: Date; pagesCrawled: number; currentlyCrawling: string | null; name: string | null; logoUrl: string | null; summary: string | null; }) => ({
              id: s.id,
              url: s.url,
              description: s.description,
              status: s.status as any,
              lastCrawled: s.lastCrawled ? s.lastCrawled.toLocaleDateString() : 'Never',
              createdAt: s.createdAt,
              pagesCrawled: s.pagesCrawled || 0,
              currentlyCrawling: s.currentlyCrawling || undefined,
              name: s.name || undefined,
              logoUrl: s.logoUrl || undefined,
              summary: s.summary || undefined,
            }));
            if (filtered.length > startIndex + LMT) {
              lastVisibleId = sitesList[sitesList.length - 1]?.id || null;
            }

        } else {
            const base = await prisma.site.findMany({
              orderBy: { createdAt: "desc" },
              take: LMT,
              ...(startAfterDocId
                ? {
                    cursor: { id: startAfterDocId },
                    skip: 1,
                  }
                : {}),
            });
            sitesList = base.map((s: { id: string; url: string; description: string; status: string; lastCrawled: Date | null; createdAt: Date; pagesCrawled: number; currentlyCrawling: string | null; name: string | null; logoUrl: string | null; summary: string | null; }) => ({
              id: s.id,
              url: s.url,
              description: s.description,
              status: s.status as any,
              lastCrawled: s.lastCrawled ? s.lastCrawled.toLocaleDateString() : 'Never',
              createdAt: s.createdAt,
              pagesCrawled: s.pagesCrawled || 0,
              currentlyCrawling: s.currentlyCrawling || undefined,
              name: s.name || undefined,
              logoUrl: s.logoUrl || undefined,
              summary: s.summary || undefined,
            }));
            lastVisibleId = sitesList.length ? sitesList[sitesList.length - 1].id : null;
        }

        return {
            sites: sitesList,
            lastVisibleId: lastVisibleId,
        }
    } catch (error) {
        await logError(error, "getSites");
        return { sites: [], lastVisibleId: null };
    }
}


// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const userAgent = "NeupBot/1.0 (+https://neupsearch.com/bot)";

// --- Robots.txt and Sitemap Parsing ---
async function getRobotsTxt(siteUrl: string): Promise<string | null> {
    try {
        const robotsUrl = new URL("/robots.txt", siteUrl);
        const response = await fetch(robotsUrl.toString(), { headers: { 'User-Agent': userAgent } });
        if (response.ok) {
            return await response.text();
        }
        return null;
    } catch (error) {
        await logError({ error, siteUrl }, `getRobotsTxt`);
        return null;
    }
}

function parseRobotsTxt(robotsTxt: string): { sitemaps: string[], disallow: RegExp[] } {
    const sitemaps: string[] = [];
    const disallow: RegExp[] = [];
    let isOurBot = false;

    robotsTxt.split('\n').forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        
        if (key.toLowerCase() === 'user-agent') {
            isOurBot = value === '*' || value === userAgent;
        } else if (isOurBot && key.toLowerCase() === 'sitemap') {
            sitemaps.push(value);
        } else if (isOurBot && key.toLowerCase() === 'disallow') {
            if (value) {
                // Convert glob to regex
                const regex = new RegExp('^' + value.replace(/\*/g, '.*').replace(/\//g, '\\/'));
                disallow.push(regex);
            }
        }
    });

    return { sitemaps, disallow };
}

async function getSitemapUrls(sitemapUrl: string): Promise<string[]> {
    try {
        const response = await fetch(sitemapUrl, { headers: { 'User-Agent': userAgent } });
        if (!response.ok) return [];

        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const urls: string[] = [];

        $('url > loc').each((i: number, el: cheerio.Element) => {
            urls.push($(el).text());
        });
        
        // Handle nested sitemaps
        const nestedSitemaps = $('sitemap > loc').map((i: number, el: cheerio.Element) => $(el).text()).get();
        for (const nestedSitemap of nestedSitemaps) {
            urls.push(...await getSitemapUrls(nestedSitemap));
        }

        return urls;
    } catch (error) {
        await logError({ error, sitemapUrl }, `getSitemapUrls`);
        return [];
    }
}

async function siteExists(url: string): Promise<boolean> {
    const s = await prisma.site.findFirst({ where: { url } });
    return !!s;
}

// --- End of Robots.txt and Sitemap Parsing ---


export async function crawlSite(formData: FormData) {
    const siteId = formData.get("siteId") as string;
    const siteUrl = formData.get("siteUrl") as string;

    if (!siteId || !siteUrl) {
        throw new Error("siteId and siteUrl are required.");
    }
    
    let crawledUrls = new Set<string>();
    const domain = new URL(siteUrl).hostname;
    let pagesProcessed = 0;
    
    try {
        await prisma.site.update({ where: { id: siteId }, data: { status: "Crawling", currentlyCrawling: "Fetching robots.txt..." } });

        const robotsTxt = await getRobotsTxt(siteUrl);
        const { sitemaps, disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] };

        const urlQueue: string[] = [];

        // Prioritize sitemap URLs
        if (sitemaps.length > 0) {
            await prisma.site.update({ where: { id: siteId }, data: { currentlyCrawling: `Found ${sitemaps.length} sitemaps. Parsing...` } });
            for (const sitemapUrl of sitemaps) {
                const sitemapUrls = await getSitemapUrls(sitemapUrl);
                urlQueue.push(...sitemapUrls);
            }
        } else {
             // If no sitemaps in robots.txt, try the default sitemap.xml location
            const defaultSitemapUrl = new URL("/sitemap.xml", siteUrl).toString();
            const sitemapUrls = await getSitemapUrls(defaultSitemapUrl);
            if(sitemapUrls.length > 0) {
                 await prisma.site.update({ where: { id: siteId }, data: { currentlyCrawling: `Found default sitemap.xml. Parsing...` } });
                 urlQueue.push(...sitemapUrls);
            }
        }
        
        // Add base URL if queue is empty (fallback to link discovery)
        if (urlQueue.length === 0) {
            urlQueue.push(siteUrl);
        }

        while (urlQueue.length > 0) {
            // Check for cancellation
            const currentSite = await prisma.site.findUnique({ where: { id: siteId }, select: { status: true } });
            if (currentSite?.status !== "Crawling") {
                console.log("Crawl cancelled by user.");
                await prisma.site.update({ where: { id: siteId }, data: { currentlyCrawling: "Crawl cancelled." } });
                break; 
            }
            
            const currentUrl = urlQueue.shift()!;
            
            // Normalize URL to avoid crawling the same page with different fragments or parameters
            const normalizedUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname;

            if (crawledUrls.has(normalizedUrl) || disallow.some(regex => regex.test(new URL(currentUrl).pathname))) {
                continue;
            }

            await prisma.site.update({
              where: { id: siteId },
              data: { currentlyCrawling: `Crawling ${currentUrl}`, pagesCrawled: pagesProcessed }
            });
            
            try {
                const response = await fetch(currentUrl, { headers: { 'User-Agent': userAgent } });
                crawledUrls.add(normalizedUrl);
                const contentType = response.headers.get('content-type');
                
                if (!response.ok || !contentType?.includes('text/html')) {
                    console.warn(`Skipping ${currentUrl}: Not an HTML page or failed to fetch (status: ${response.status})`);
                    continue;
                }
                
                const html = await response.text();
                const $ = cheerio.load(html);

                const pageTitle = $('title').text() || $('h1').first().text();

                // --- Comprehensive Data Extraction ---
                const pageData = {
                    title: pageTitle,
                    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || "",
                    keywords: $('meta[name="keywords"]').attr('content') || "",
                    content: $('body').text().replace(/\s\s+/g, ' ').trim(),
                    bodyHtml: $('body').html() || "",
                    url: currentUrl,
                    siteId,
                    siteUrl,
                    status: "Indexed" as const,
                    lastIndexed: new Date(),
                    httpHeaders: Object.fromEntries(response.headers.entries()),
                    canonicalUrl: $('link[rel="canonical"]').attr('href'),
                    lang: $('html').attr('lang'),
                    openGraph: {
                        title: $('meta[property="og:title"]').attr('content'),
                        type: $('meta[property="og:type"]').attr('content'),
                        image: $('meta[property="og:image"]').attr('content'),
                        url: $('meta[property="og:url"]').attr('content'),
                    },
                    images: $('img').map((i: number, el: cheerio.Element) => ({ src: $(el).attr('src'), alt: $(el).attr('alt') })).get().filter((img: { src?: string | null }) => !!img.src),
                    videos: $('video').map((i: number, el: cheerio.Element) => $(el).attr('src')).get().filter((src: string | undefined | null) => !!src),
                    audios: $('audio').map((i: number, el: cheerio.Element) => $(el).attr('src')).get().filter((src: string | undefined | null) => !!src),
                };

                await prisma.$transaction(async (tx: any) => {
                  await tx.page.upsert({
                    where: { url: currentUrl },
                    create: pageData,
                    update: pageData,
                  });

                  const linkCreates: { sourceUrl: string; sourceTitle?: string | null; targetUrl: string }[] = [];
                  for (const link of $('a').toArray()) {
                    const href = $(link).attr('href');
                    if (!href) continue;
                    try {
                      const absoluteUrl = new URL(href, siteUrl).toString().split('#')[0];
                      linkCreates.push({
                        sourceUrl: currentUrl,
                        sourceTitle: pageTitle,
                        targetUrl: absoluteUrl,
                      });
                    } catch (_) {
                    }
                  }
                  if (linkCreates.length) {
                    for (const l of linkCreates) {
                      await tx.link.create({ data: l });
                    }
                  }
                });

                pagesProcessed++;

                for (const link of $('a').toArray()) {
                  const href = $(link).attr('href');
                  if (!href) continue;
                  try {
                    const absoluteUrl = new URL(href, siteUrl).toString().split('#')[0];
                    const linkHostname = new URL(absoluteUrl).hostname;
                    if (linkHostname === domain) {
                      const normalizedInternalUrl = new URL(absoluteUrl).origin + new URL(absoluteUrl).pathname;
                      if (!crawledUrls.has(normalizedInternalUrl) && !urlQueue.includes(absoluteUrl)) {
                        urlQueue.push(absoluteUrl);
                      }
                    } else {
                      const externalSiteUrl = new URL(absoluteUrl).origin;
                      if (!(await siteExists(externalSiteUrl))) {
                        await prisma.site.upsert({
                          where: { url: externalSiteUrl },
                          create: {
                            url: externalSiteUrl,
                            description: `Discovered from ${currentUrl}`,
                            status: "Pending",
                          },
                          update: {},
                        });
                      }
                    }
                  } catch (_) {
                  }
                }

            } catch (fetchError) {
                await logError({ error: fetchError, currentUrl }, 'crawlSite_fetch');
                console.warn(`Skipping ${currentUrl}: Error during fetch - ${fetchError}`);
            }
            
            await sleep(100); 
        }

        await prisma.site.update({
          where: { id: siteId },
          data: {
            status: "Active",
            lastCrawled: new Date(),
            pagesCrawled: crawledUrls.size,
            currentlyCrawling: "Crawl complete.",
          }
        });

    } catch (error: any) {
        await logError(error, "crawlSite");
        await prisma.site.update({ where: { id: siteId }, data: { status: "Error", currentlyCrawling: `Crawl failed: ${error.message}` } });
    } finally {
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
        revalidatePath("/manage/pages");
    }
}


export async function getSiteById(siteId: string): Promise<Site | null> {
    try {
        const s = await prisma.site.findUnique({ where: { id: siteId } });
        if (!s) return null;
        return {
          id: s.id,
          url: s.url,
          description: s.description,
          status: s.status as any,
          lastCrawled: s.lastCrawled ? s.lastCrawled.toLocaleDateString() : 'Never',
          createdAt: s.createdAt,
          pagesCrawled: s.pagesCrawled || 0,
          currentlyCrawling: s.currentlyCrawling || undefined,
          name: s.name || undefined,
          logoUrl: s.logoUrl || undefined,
          summary: s.summary || undefined,
        };
    } catch (error) {
        await logError(error, "getSiteById");
        return null;
    }
}

export async function getPagesForSite(siteId: string, startAfterDocId?: string): Promise<PaginatedSitePages> {
    try {
        const base = await prisma.page.findMany({
          where: { siteId },
          orderBy: { url: "asc" },
          take: 20,
          ...(startAfterDocId
            ? {
                cursor: { id: startAfterDocId },
                skip: 1,
              }
            : {}),
          select: { id: true, url: true, title: true, siteUrl: true, status: true, lastIndexed: true, createdAt: true }
        });

        const pagesList = base.map((doc: { id: string; url: string; title: string | null; siteUrl: string | null; status: string; lastIndexed: Date | null; createdAt: Date; }) => {
          const page: Page = {
            id: doc.id,
            url: doc.url,
            title: doc.title || 'No title',
            siteUrl: doc.siteUrl || '',
            status: doc.status as any,
            lastIndexed: doc.lastIndexed ? doc.lastIndexed.toLocaleDateString() : 'Never',
            createdAt: doc.createdAt,
          };
          return page;
        });
        
        const firstVisible = pagesList[0] || null;
        const lastVisible = pagesList[pagesList.length - 1] || null;

        return {
            pages: pagesList,
            lastVisibleId: lastVisible ? lastVisible.id : null,
            firstVisibleId: firstVisible ? firstVisible.id : null,
        }

    } catch (error) {
        await logError(error, "getPagesForSite");
        return { pages: [], lastVisibleId: null, firstVisibleId: null };
    }
}

export async function getDashboardStats() {
    try {
        const totalSites = await prisma.site.count();
        const totalPages = await prisma.page.count();
        const activeCrawls = await prisma.site.count({ where: { status: "Crawling" } });
        const crawlErrors = await prisma.site.count({ where: { status: "Error" } });

        return {
            totalSites,
            totalPages,
            activeCrawls,
            crawlErrors,
        }
    } catch (error) {
        await logError(error, "getDashboardStats");
        return {
            totalSites: 0,
            totalPages: 0,
            activeCrawls: 0,
            crawlErrors: 0,
        };
    }
}


export async function cancelCrawl(formData: FormData) {
    const siteId = formData.get("siteId") as string;
    if (!siteId) {
        throw new Error("siteId is required.");
    }
    try {
        await prisma.site.update({ where: { id: siteId }, data: { status: "Active", currentlyCrawling: "Crawl cancelled by user." } });
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
    } catch (error) {
        await logError(error, `cancelCrawl`);
    }
}

export async function deletePagesForSite(formData: FormData) {
    const siteId = formData.get("siteId") as string;
    if (!siteId) {
        throw new Error("siteId is required.");
    }
    try {
        await prisma.page.deleteMany({ where: { siteId } });
        await prisma.site.update({ where: { id: siteId }, data: { pagesCrawled: 0, lastCrawled: null } });

        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/pages");

    } catch (error) {
        await logError(error, `deletePagesForSite`);
    }
}

export async function deleteLinksForPage(pageUrl: string) {
    try {
        await prisma.link.deleteMany({ where: { sourceUrl: pageUrl } });

    } catch (error) {
        await logError(error, `deleteLinksForPage`);
    }
}

export async function crawlAllSites() {
    try {
        const sitesToCrawl = await prisma.site.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, url: true }
        });

        for (const site of sitesToCrawl) {
            const formData = new FormData();
            formData.append('siteId', site.id);
            formData.append('siteUrl', site.url);
            // No need to await here, let them run. 
            // The UI will update automatically for each site as it starts/finishes.
            crawlSite(formData);
        }

    } catch (error) {
        await logError(error, "crawlAllSites");
    } finally {
        revalidatePath("/manage/sites");
    }
}
    

    
