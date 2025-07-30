

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch, getDoc, limit, startAfter, where, endAt, startAt,getCountFromServer } from "firebase/firestore"
import { z } from "zod"
import * as cheerio from "cheerio"
import { db } from "@/lib/firebase"
import type { Page, PaginatedPages } from "../pages/actions"

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

  try {
    await addDoc(collection(db, "sites"), {
      url: validatedFields.data.url,
      description: validatedFields.data.description,
      status: "Pending",
      createdAt: Timestamp.now(),
      lastCrawled: null,
      pagesCrawled: 0,
      currentlyCrawling: "",
    })
  } catch (error) {
    console.error("Error adding document: ", error)
    return {
      errors: { _server: ["Could not add site. Please try again."] },
    }
  }

  revalidatePath("/manage/sites")
  redirect("/manage/sites")
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

export async function crawlSite(siteId: string, siteUrl: string) {
    const siteRef = doc(db, "sites", siteId);
    let crawledUrls = new Map<string, {title: string, content: string}>();
    let externalSites = new Set<string>();
    const urlQueue = [siteUrl];
    const domain = new URL(siteUrl).hostname;
    let pagesProcessed = 0;

    try {
        await updateDoc(siteRef, { status: "Crawling", currentlyCrawling: "Starting..." });
        revalidatePath("/manage/sites");

        while (urlQueue.length > 0) {
            const currentUrl = urlQueue.shift()!;
            if (crawledUrls.has(currentUrl)) {
                continue;
            }

            await updateDoc(siteRef, { 
                currentlyCrawling: `Crawling ${currentUrl}`,
                pagesCrawled: pagesProcessed,
            });
            revalidatePath("/manage/sites");
            
            try {
                const response = await fetch(currentUrl, { headers: { 'User-Agent': 'NeupBot/1.0' } });
                if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
                    console.warn(`Skipping ${currentUrl}: Not an HTML page or failed to fetch (status: ${response.status})`);
                    continue;
                }

                const html = await response.text();
                const $ = cheerio.load(html);

                const title = $('title').text() || $('h1').first().text();
                const content = $('body').text().replace(/\s\s+/g, ' ').trim();

                crawledUrls.set(currentUrl, { title, content });
                pagesProcessed++;

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

        const pagesBatch = writeBatch(db);
        const pagesCollection = collection(db, "pages");
        crawledUrls.forEach(({ title, content }, url) => {
            const newPageRef = doc(pagesCollection);
            pagesBatch.set(newPageRef, {
                url: url,
                title: title,
                content: content,
                siteId: siteId,
                siteUrl: siteUrl,
                status: "Indexed",
                lastIndexed: Timestamp.now(),
                createdAt: Timestamp.now(),
            });
        });
        await pagesBatch.commit();
        
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
            return {
                id: doc.id,
                url: data.url,
                siteUrl: data.siteUrl,
                status: data.status,
                lastIndexed: data.lastIndexed ? (data.lastIndexed as Timestamp).toDate().toLocaleDateString() : 'Never',
                createdAt: (data.createdAt as Timestamp).toDate(),
            };
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

    