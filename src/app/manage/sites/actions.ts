

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch, getDoc, limit, startAfter, where } from "firebase/firestore"
import { z } from "zod"
import * as cheerio from "cheerio"
import { db } from "@/lib/firebase"

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

export async function getSites(startAfterDocId?: string): Promise<PaginatedSites> {
    try {
        const sitesCollection = collection(db, "sites");
        let q;
        if (startAfterDocId) {
            const lastVisibleDoc = await getDoc(doc(db, "sites", startAfterDocId));
            q = query(sitesCollection, orderBy("createdAt", "desc"), startAfter(lastVisibleDoc), limit(20));
        } else {
            q = query(sitesCollection, orderBy("createdAt", "desc"), limit(20));
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
    let crawledUrls = new Set<string>();
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

            crawledUrls.add(currentUrl);
            pagesProcessed++;

            const response = await fetch(currentUrl, { headers: { 'User-Agent': 'NeupBot/1.0' } });
            if (!response.ok) {
                console.warn(`Skipping ${currentUrl}: Failed to fetch (status: ${response.status})`);
                continue;
            }

            const html = await response.text();
            const $ = cheerio.load(html);

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
            await sleep(100); 
        }

        const pagesBatch = writeBatch(db);
        const pagesCollection = collection(db, "pages");
        crawledUrls.forEach(url => {
            const newPageRef = doc(pagesCollection);
            pagesBatch.set(newPageRef, {
                url: url,
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
        revalidatePath("/manage/sites");
        revalidatePath("/manage/pages");
    }
}
