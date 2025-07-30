

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch, getDoc, limit, startAfter, where, endAt, startAt,getCountFromServer, deleteDoc } from "firebase/firestore"
import { z } from "zod"
import * as cheerio from "cheerio"
import { db } from "@/lib/firebase"
import type { Page, PaginatedPages } from "../pages/actions"
import { summarizeSite } from "@/ai/flows/summarize-site-flow"

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

  let siteId: string;
  const siteUrl = validatedFields.data.url;

  try {
    const docRef = await addDoc(collection(db, "sites"), {
      url: siteUrl,
      description: validatedFields.data.description,
      status: "Pending",
      createdAt: Timestamp.now(),
      lastCrawled: null,
      pagesCrawled: 0,
      currentlyCrawling: "Summarizing site...",
    });
    siteId = docRef.id;
  } catch (error) {
    console.error("Error adding document: ", error)
    return {
      errors: { _server: ["Could not add site. Please try again."] },
    }
  }
  
  // Trigger summarization asynchronously (don't block the redirect)
  summarizeSiteAction(siteId, siteUrl).catch(console.error);

  revalidatePath("/manage/sites")
  redirect("/manage/sites")
}

export async function summarizeSiteAction(siteId: string, siteUrl: string) {
    const siteRef = doc(db, "sites", siteId);
    try {
        await updateDoc(siteRef, { currentlyCrawling: "Summarizing site..." });
        revalidatePath(`/manage/sites/${siteId}`);

        const summaryData = await summarizeSite({ url: siteUrl });
        
        await updateDoc(siteRef, {
            name: summaryData.name,
            summary: summaryData.summary,
            logoUrl: summaryData.logoUrl,
            currentlyCrawling: "",
        });

    } catch (error) {
        console.error(`Error summarizing site ${siteId}:`, error);
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
        let q: any;

        if (search) {
             const queryConstraints = [
                orderBy("url"),
                where('url', '>=', search),
                where('url', '<=', search + '\uf8ff'),
                limit(20)
            ];
            q = query(sitesCollection, ...queryConstraints);
        } else {
            const queryConstraints = [orderBy("createdAt", "desc"), limit(20)];
            if (startAfterDocId) {
                const lastVisibleDoc = await getDoc(doc(db, "sites", startAfterDocId));
                queryConstraints.push(startAfter(lastVisibleDoc));
            }
            q = query(sitesCollection, ...queryConstraints);
        }
        
        const siteSnapshot = await getDocs(q);
        const sitesList = siteSnapshot.docs.map(doc => {
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

        return {
            sites: sitesList,
            lastVisibleId: lastVisible ? lastVisible.id : null,
        }
    } catch (error) {
        console.error("Error fetching sites: ", error);
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
        console.error(`Could not fetch robots.txt for ${siteUrl}:`, error);
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
        console.error(`Error parsing sitemap ${sitemapUrl}:`, error);
        return [];
    }
}
// --- End of Robots.txt and Sitemap Parsing ---


export async function crawlSite(siteId: string, siteUrl: string) {
    const siteRef = doc(db, "sites", siteId);
    let crawledUrls = new Set<string>();
    let externalSites = new Set<string>();
    const domain = new URL(siteUrl).hostname;
    let pagesProcessed = 0;
    
    try {
        await updateDoc(siteRef, { status: "Crawling", currentlyCrawling: "Fetching robots.txt..." });
        revalidatePath(`/manage/sites/${siteId}`);

        const robotsTxt = await getRobotsTxt(siteUrl);
        const { sitemaps, disallow } = robotsTxt ? parseRobotsTxt(robotsTxt) : { sitemaps: [], disallow: [] };

        const urlQueue: string[] = [];

        // Prioritize sitemap URLs
        if (sitemaps.length > 0) {
            await updateDoc(siteRef, { currentlyCrawling: `Found ${sitemaps.length} sitemaps. Parsing...` });
            revalidatePath(`/manage/sites/${siteId}`);
            for (const sitemapUrl of sitemaps) {
                const sitemapUrls = await getSitemapUrls(sitemapUrl);
                urlQueue.push(...sitemapUrls);
            }
        }
        
        // Add base URL if queue is empty
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
            
            if (crawledUrls.has(currentUrl) || disallow.some(regex => regex.test(new URL(currentUrl).pathname))) {
                continue;
            }

            await updateDoc(siteRef, { 
                currentlyCrawling: `Crawling ${currentUrl}`,
                pagesCrawled: pagesProcessed,
            });
            revalidatePath(`/manage/sites/${siteId}`);
            
            try {
                const response = await fetch(currentUrl, { headers: { 'User-Agent': userAgent } });
                const contentType = response.headers.get('content-type');
                
                if (!response.ok || !contentType?.includes('text/html')) {
                    console.warn(`Skipping ${currentUrl}: Not an HTML page or failed to fetch (status: ${response.status})`);
                    continue;
                }
                
                crawledUrls.add(currentUrl);
                const html = await response.text();
                const $ = cheerio.load(html);

                // --- Comprehensive Data Extraction ---
                const pageData = {
                    title: $('title').text() || $('h1').first().text(),
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

                // Add to batch for Firestore
                const pagesCollection = collection(db, "pages");
                const pageQuery = query(pagesCollection, where("url", "==", currentUrl), limit(1));
                const existingPageSnapshot = await getDocs(pageQuery);

                const batch = writeBatch(db);
                if (existingPageSnapshot.empty) {
                    const newPageRef = doc(pagesCollection);
                    batch.set(newPageRef, pageData);
                } else {
                    const pageDocRef = existingPageSnapshot.docs[0].ref;
                    batch.update(pageDocRef, pageData);
                }
                await batch.commit();

                pagesProcessed++;

                // Link discovery
                $('a').each((i, link) => {
                    const href = $(link).attr('href');
                    if (href) {
                        try {
                            const absoluteUrl = new URL(href, siteUrl).toString().split('#')[0];
                            const linkHostname = new URL(absoluteUrl).hostname;

                            if (linkHostname === domain) {
                                if (!crawledUrls.has(absoluteUrl) && !urlQueue.includes(absoluteUrl)) {
                                    urlQueue.push(absoluteUrl);
                                }
                            } else {
                                const rootUrl = new URL(absoluteUrl).origin;
                                externalSites.add(rootUrl);
                            }
                        } catch (e) {
                            // Ignore invalid URLs
                        }
                    }
                });

            } catch (fetchError) {
                console.warn(`Skipping ${currentUrl}: Error during fetch - ${fetchError}`);
            }
            
            await sleep(100); 
        }

        // Discover and add new external sites
        const sitesCollection = collection(db, "sites");
        for (const newSiteUrl of externalSites) {
            const q = query(sitesCollection, where("url", "==", newSiteUrl), limit(1));
            const existingSiteSnapshot = await getDocs(q);
            if (existingSiteSnapshot.empty) {
                await addDoc(sitesCollection, {
                    url: newSiteUrl,
                    description: `Discovered from ${siteUrl}`,
                    status: "Pending",
                    createdAt: Timestamp.now(),
                    lastCrawled: null,
                    pagesCrawled: 0,
                    currentlyCrawling: "",
                });
            }
        }

        await updateDoc(siteRef, { 
            status: "Active",
            lastCrawled: Timestamp.now(),
            pagesCrawled: crawledUrls.size,
            currentlyCrawling: "Crawl complete."
        });

    } catch (error: any) {
        console.error("Error crawling site: ", error);
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
        console.error("Error fetching site: ", error);
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
        console.error("Error fetching pages for site: ", error);
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
        console.error("Error fetching dashboard stats: ", error);
        return {
            totalSites: 0,
            totalPages: 0,
            activeCrawls: 0,
            crawlErrors: 0,
        };
    }
}


export async function cancelCrawl(siteId: string) {
    try {
        const siteRef = doc(db, "sites", siteId);
        await updateDoc(siteRef, { status: "Active", currentlyCrawling: "Crawl cancelled by user." });
        revalidatePath(`/manage/sites/${siteId}`);
        revalidatePath("/manage/sites");
    } catch (error) {
        console.error(`Error cancelling crawl for site ${siteId}:`, error);
        // Optionally handle the error, e.g., by returning an error message
    }
}

export async function deletePagesForSite(siteId: string) {
    try {
        const pagesCollection = collection(db, "pages");
        const q = query(pagesCollection, where("siteId", "==", siteId));
        const snapshot = await getDocs(q);

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
        console.error(`Error deleting pages for site ${siteId}:`, error);
    }
}
