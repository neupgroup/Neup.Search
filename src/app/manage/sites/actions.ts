

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch, getDoc, limit, startAfter, where, endAt, startAt,getCountFromServer, deleteDoc } from "firebase/firestore"
import { z } from "zod"
import * as cheerio from "cheerio"
import { db } from "@/lib/firebase"
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
    const docRef = await addDoc(collection(db, "sites"), {
      url: siteData.siteUrl,
      description: siteData.description,
      status: "Pending",
      createdAt: Timestamp.now(),
      lastCrawled: null,
      pagesCrawled: 0,
      currentlyCrawling: "Summarizing site...",
    });
    siteData.siteId = docRef.id;
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

    const siteRef = doc(db, "sites", siteId);
    try {
        await updateDoc(siteRef, { currentlyCrawling: "Summarizing site..." });

        const summaryData = await summarizeSite({ url: siteUrl });
        
        await updateDoc(siteRef, {
            name: summaryData.name,
            summary: summaryData.summary,
            logoUrl: summaryData.logoUrl,
            currentlyCrawling: "",
        });

    } catch (error) {
        await logError(error, "summarizeSiteAction");
        await updateDoc(siteRef, { 
            currentlyCrawling: "Failed to summarize site.",
            status: "Error",
        });
    } finally {
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
    }
}


export async function getSites(search?: string, startAfterDocId?: string): Promise<PaginatedSites> {
    try {
        const sitesCollection = collection(db, "sites");
        let sitesList: Site[] = [];
        let lastVisibleId: string | null = null;
        const LMT = 20;

        if (search) {
            // Firestore doesn't support case-insensitive 'contains' queries, so we fetch all and filter locally.
            // This is not performant on very large datasets. A real search engine would use a more robust
            // search solution like Algolia, Typesense, or Elasticsearch.
            const allSitesSnapshot = await getDocs(query(sitesCollection, orderBy("createdAt", "desc")));
            const lowercasedSearch = search.toLowerCase();
            
            const filteredSites = allSitesSnapshot.docs.map(doc => {
                 const data = doc.data();
                return {
                    id: doc.id,
                    url: data.url,
                    description: data.description,
                    status: data.status,
                    lastCrawled: data.lastCrawled ? (data.lastCrawled as Timestamp).toDate().toLocaleDateString() : 'Never',
                    createdAt: (data.createdAt as Timestamp).toDate(),
                    pagesCrawled: data.pagesCrawled || 0,
                    currentlyCrawling: data.currentlyCrawling || null,
                    name: data.name || null,
                    logoUrl: data.logoUrl || null,
                    summary: data.summary || null,
                };
            }).filter(site => 
                site.url.toLowerCase().includes(lowercasedSearch) ||
                (site.name && site.name.toLowerCase().includes(lowercasedSearch)) ||
                (site.summary && site.summary.toLowerCase().includes(lowercasedSearch)) ||
                site.description.toLowerCase().includes(lowercasedSearch)
            );

            // Manual pagination on the filtered results
            let startIndex = 0;
            if (startAfterDocId) {
                const foundIndex = filteredSites.findIndex(s => s.id === startAfterDocId);
                if (foundIndex !== -1) {
                    startIndex = foundIndex + 1;
                }
            }

            sitesList = filteredSites.slice(startIndex, startIndex + LMT);
            if (filteredSites.length > startIndex + LMT) {
                lastVisibleId = sitesList[sitesList.length - 1]?.id || null;
            }

        } else {
            const queryConstraints = [orderBy("createdAt", "desc"), limit(LMT)];
            if (startAfterDocId) {
                const lastVisibleDoc = await getDoc(doc(db, "sites", startAfterDocId));
                queryConstraints.push(startAfter(lastVisibleDoc));
            }
            const q = query(sitesCollection, ...queryConstraints);
            
            const siteSnapshot = await getDocs(q);
            sitesList = siteSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    url: data.url,
                    description: data.description,
                    status: data.status,
                    lastCrawled: data.lastCrawled ? (data.lastCrawled as Timestamp).toDate().toLocaleDateString() : 'Never',
                    createdAt: (data.createdAt as Timestamp).toDate(),
                    pagesCrawled: data.pagesCrawled || 0,
                    currentlyCrawling: data.currentlyCrawling || null,
                    name: data.name || null,
                    logoUrl: data.logoUrl || null,
                    summary: data.summary || null,
                };
            });

            const lastVisible = siteSnapshot.docs[siteSnapshot.docs.length - 1];
            lastVisibleId = lastVisible ? lastVisible.id : null;
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

        $('url > loc').each((i, el) => {
            urls.push($(el).text());
        });
        
        // Handle nested sitemaps
        const nestedSitemaps = $('sitemap > loc').map((i, el) => $(el).text()).get();
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
    const sitesCollection = collection(db, "sites");
    const q = query(sitesCollection, where("url", "==", url), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

// --- End of Robots.txt and Sitemap Parsing ---


export async function crawlSite(formData: FormData) {
    const siteId = formData.get("siteId") as string;
    const siteUrl = formData.get("siteUrl") as string;

    if (!siteId || !siteUrl) {
        throw new Error("siteId and siteUrl are required.");
    }
    
    const siteRef = doc(db, "sites", siteId);
    let crawledUrls = new Set<string>();
    const domain = new URL(siteUrl).hostname;
    let pagesProcessed = 0;
    
    try {
        await updateDoc(siteRef, { status: "Crawling", currentlyCrawling: "Fetching robots.txt..." });

        const robotsTxt = await getRobotsTxt(siteUrl);
        const { sitemaps, disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] };

        const urlQueue: string[] = [];

        // Prioritize sitemap URLs
        if (sitemaps.length > 0) {
            await updateDoc(siteRef, { currentlyCrawling: `Found ${sitemaps.length} sitemaps. Parsing...` });
            for (const sitemapUrl of sitemaps) {
                const sitemapUrls = await getSitemapUrls(sitemapUrl);
                urlQueue.push(...sitemapUrls);
            }
        } else {
             // If no sitemaps in robots.txt, try the default sitemap.xml location
            const defaultSitemapUrl = new URL("/sitemap.xml", siteUrl).toString();
            const sitemapUrls = await getSitemapUrls(defaultSitemapUrl);
            if(sitemapUrls.length > 0) {
                 await updateDoc(siteRef, { currentlyCrawling: `Found default sitemap.xml. Parsing...` });
                 urlQueue.push(...sitemapUrls);
            }
        }
        
        // Add base URL if queue is empty (fallback to link discovery)
        if (urlQueue.length === 0) {
            urlQueue.push(siteUrl);
        }

        while (urlQueue.length > 0) {
            // Check for cancellation
            const currentSiteDoc = await getDoc(siteRef);
            if (currentSiteDoc.data()?.status !== "Crawling") {
                console.log("Crawl cancelled by user.");
                await updateDoc(siteRef, { currentlyCrawling: "Crawl cancelled." });
                break; 
            }
            
            const currentUrl = urlQueue.shift()!;
            
            // Normalize URL to avoid crawling the same page with different fragments or parameters
            const normalizedUrl = new URL(currentUrl).origin + new URL(currentUrl).pathname;

            if (crawledUrls.has(normalizedUrl) || disallow.some(regex => regex.test(new URL(currentUrl).pathname))) {
                continue;
            }

            await updateDoc(siteRef, { 
                currentlyCrawling: `Crawling ${currentUrl}`,
                pagesCrawled: pagesProcessed,
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
                    status: "Indexed",
                    lastIndexed: Timestamp.now(),
                    createdAt: Timestamp.now(),
                    httpHeaders: Object.fromEntries(response.headers.entries()),
                    canonicalUrl: $('link[rel="canonical"]').attr('href'),
                    lang: $('html').attr('lang'),
                    openGraph: {
                        title: $('meta[property="og:title"]').attr('content'),
                        type: $('meta[property="og:type"]').attr('content'),
                        image: $('meta[property="og:image"]').attr('content'),
                        url: $('meta[property="og:url"]').attr('content'),
                    },
                    images: $('img').map((i, el) => ({ src: $(el).attr('src'), alt: $(el).attr('alt') })).get().filter(img => img.src),
                    videos: $('video').map((i, el) => $(el).attr('src')).get().filter(src => src),
                    audios: $('audio').map((i, el) => $(el).attr('src')).get().filter(src => src),
                };

                const batch = writeBatch(db);

                // Add/Update page document
                const pagesCollection = collection(db, "pages");
                const pageQuery = query(pagesCollection, where("url", "==", currentUrl), limit(1));
                const existingPageSnapshot = await getDocs(pageQuery);

                if (existingPageSnapshot.empty) {
                    const newPageRef = doc(pagesCollection);
                    batch.set(newPageRef, pageData);
                } else {
                    const pageDocRef = existingPageSnapshot.docs[0].ref;
                    batch.update(pageDocRef, pageData);
                }
                
                pagesProcessed++;

                // Link discovery and backlink creation
                const linksCollection = collection(db, "links");
                for (const link of $('a').toArray()) {
                     const href = $(link).attr('href');
                     if (href) {
                        try {
                            const absoluteUrl = new URL(href, siteUrl).toString().split('#')[0];
                            const linkHostname = new URL(absoluteUrl).hostname;
                            
                            // Log the link relationship
                            const linkDocRef = doc(collection(db, "links")); // Create new ref for each link
                             batch.set(linkDocRef, {
                                sourceUrl: currentUrl,
                                sourceTitle: pageTitle,
                                targetUrl: absoluteUrl
                            });

                            if (linkHostname === domain) {
                                // Add internal links to the queue if not already crawled or in queue
                                const normalizedInternalUrl = new URL(absoluteUrl).origin + new URL(absoluteUrl).pathname;
                                if (!crawledUrls.has(normalizedInternalUrl) && !urlQueue.includes(absoluteUrl)) {
                                    urlQueue.push(absoluteUrl);
                                }
                            } else {
                                // If external link, check if it's a new site and add it.
                                const externalSiteUrl = new URL(absoluteUrl).origin;
                                if (!(await siteExists(externalSiteUrl))) {
                                     await addDoc(collection(db, "sites"), {
                                        url: externalSiteUrl,
                                        description: `Discovered from ${currentUrl}`,
                                        status: "Pending",
                                        createdAt: Timestamp.now(),
                                        lastCrawled: null,
                                        pagesCrawled: 0,
                                    });
                                }
                            }
                        } catch (e) {
                           // Ignore invalid URLs
                           // console.warn(`Invalid URL found on ${currentUrl}: ${href}`);
                        }
                    }
                }
                
                await batch.commit();

            } catch (fetchError) {
                await logError({ error: fetchError, currentUrl }, 'crawlSite_fetch');
                console.warn(`Skipping ${currentUrl}: Error during fetch - ${fetchError}`);
            }
            
            await sleep(100); 
        }

        await updateDoc(siteRef, { 
            status: "Active",
            lastCrawled: Timestamp.now(),
            pagesCrawled: crawledUrls.size,
            currentlyCrawling: "Crawl complete."
        });

    } catch (error: any) {
        await logError(error, "crawlSite");
        await updateDoc(siteRef, { status: "Error", currentlyCrawling: `Crawl failed: ${error.message}` });
    } finally {
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
        revalidatePath("/manage/pages");
    }
}


export async function getSiteById(siteId: string): Promise<Site | null> {
    try {
        const siteDoc = await getDoc(doc(db, "sites", siteId));
        if (!siteDoc.exists()) {
            return null;
        }
        const data = siteDoc.data();
        return {
            id: siteDoc.id,
            url: data.url,
            description: data.description,
            status: data.status,
            lastCrawled: data.lastCrawled ? (data.lastCrawled as Timestamp).toDate().toLocaleDateString() : 'Never',
            createdAt: (data.createdAt as Timestamp).toDate(),
            pagesCrawled: data.pagesCrawled || 0,
            currentlyCrawling: data.currentlyCrawling || null,
            name: data.name || null,
            logoUrl: data.logoUrl || null,
            summary: data.summary || null,
        };
    } catch (error) {
        await logError(error, "getSiteById");
        return null;
    }
}

export async function getPagesForSite(siteId: string, startAfterDocId?: string): Promise<PaginatedSitePages> {
    try {
        const pagesCollection = collection(db, "pages");
         const queryConstraints: any[] = [
            where("siteId", "==", siteId),
            orderBy("url"),
            limit(20)
        ];

        if (startAfterDocId) {
            const lastVisibleDoc = await getDoc(doc(db, "pages", startAfterDocId));
            queryConstraints.push(startAfter(lastVisibleDoc));
        }

        const q = query(pagesCollection, ...queryConstraints);
        const pageSnapshot = await getDocs(q);

        const pagesList = pageSnapshot.docs.map(doc => {
            const data = doc.data();
            const page: Page = {
                id: doc.id,
                url: data.url,
                title: data.title || 'No title',
                siteUrl: data.siteUrl,
                status: data.status,
                lastIndexed: data.lastIndexed ? (data.lastIndexed as Timestamp).toDate().toLocaleDateString() : 'Never',
                createdAt: (data.createdAt as Timestamp).toDate(),
            };
            return page;
        });
        
        const firstVisible = pageSnapshot.docs[0];
        const lastVisible = pageSnapshot.docs[pageSnapshot.docs.length - 1];

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
        const sitesCollection = collection(db, "sites");
        const pagesCollection = collection(db, "pages");

        const totalSitesSnapshot = await getCountFromServer(sitesCollection);
        const totalPagesSnapshot = await getCountFromServer(pagesCollection);

        const activeCrawlsQuery = query(sitesCollection, where("status", "==", "Crawling"));
        const activeCrawlsSnapshot = await getCountFromServer(activeCrawlsQuery);
        
        const errorCrawlsQuery = query(sitesCollection, where("status", "==", "Error"));
        const errorCrawlsSnapshot = await getCountFromServer(errorCrawlsQuery);

        return {
            totalSites: totalSitesSnapshot.data().count,
            totalPages: totalPagesSnapshot.data().count,
            activeCrawls: activeCrawlsSnapshot.data().count,
            crawlErrors: errorCrawlsSnapshot.data().count,
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
        const siteRef = doc(db, "sites", siteId);
        await updateDoc(siteRef, { status: "Active", currentlyCrawling: "Crawl cancelled by user." });
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
        const pagesCollection = collection(db, "pages");
        const q = query(pagesCollection, where("siteId", "==", siteId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        const siteRef = doc(db, "sites", siteId);
        await updateDoc(siteRef, { pagesCrawled: 0, lastCrawled: null });

        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/pages");

    } catch (error) {
        await logError(error, `deletePagesForSite`);
    }
}

export async function deleteLinksForPage(pageUrl: string) {
    try {
        const linksCollection = collection(db, "links");
        const q = query(linksCollection, where("sourceUrl", "==", pageUrl));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

    } catch (error) {
        await logError(error, `deleteLinksForPage`);
    }
}

export async function crawlAllSites() {
    try {
        const sitesCollection = collection(db, "sites");
        const q = query(sitesCollection, orderBy("createdAt", "desc"));
        const sitesSnapshot = await getDocs(q);
        
        const sitesToCrawl = sitesSnapshot.docs.map(doc => ({
            id: doc.id,
            url: doc.data().url
        }));

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
    

    
