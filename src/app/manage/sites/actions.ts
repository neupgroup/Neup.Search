
"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch } from "firebase/firestore"
import { z } from "zod"
import * as cheerio from "cheerio"
import { db } from "@/lib/firebase"

const SiteSchema = z.object({
  url: z.string().url({ message: "Please enter a valid URL." }),
  description: z.string().min(1, { message: "Description is required." }),
})

export type Site = {
  id: string;
  url: string;
  description: string;
  status: "Pending" | "Active" | "Paused" | "Error" | "Crawling";
  lastCrawled: string | null;
  createdAt: Date;
  pagesCrawled?: number;
  currentlyCrawling?: string;
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

export async function getSites(): Promise<Site[]> {
    try {
        const sitesCollection = collection(db, "sites");
        const q = query(sitesCollection, orderBy("createdAt", "desc"));
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
        return sitesList;
    } catch (error) {
        console.error("Error fetching sites: ", error);
        return [];
    }
}


// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function crawlSite(siteId: string, siteUrl: string) {
    const siteRef = doc(db, "sites", siteId);
    let crawledUrls = new Set<string>();

    try {
        // 1. Set status to "Crawling"
        await updateDoc(siteRef, { status: "Crawling", currentlyCrawling: "Starting..." });
        revalidatePath("/manage/sites");
        
        // 2. Fetch and parse the homepage
        await updateDoc(siteRef, { currentlyCrawling: `Fetching ${siteUrl}...`});
        revalidatePath("/manage/sites");

        const response = await fetch(siteUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${siteUrl}. Status: ${response.status}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        // 3. Extract links
        const links: string[] = [];
        $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href) {
                try {
                    const absoluteUrl = new URL(href, siteUrl).toString();
                    // Only crawl links on the same domain
                    if (absoluteUrl.startsWith(siteUrl)) {
                       links.push(absoluteUrl);
                    }
                } catch (e) {
                    // Ignore invalid URLs
                }
            }
        });
        
        const uniqueLinks = [...new Set(links)]; // Remove duplicates

        // 4. Batch write discovered pages to Firestore
        const batch = writeBatch(db);
        for (let i = 0; i < uniqueLinks.length; i++) {
            const url = uniqueLinks[i];
            
            // Avoid re-crawling the same URL in this run
            if(crawledUrls.has(url)) continue;
            crawledUrls.add(url);

            await updateDoc(siteRef, { 
                currentlyCrawling: `Indexing ${url}`,
                pagesCrawled: i + 1,
            });

            // Add page to the 'pages' collection
            const newPageRef = doc(collection(db, "pages"));
            batch.set(newPageRef, {
                url: url,
                siteUrl: siteUrl,
                status: "Indexed",
                lastIndexed: Timestamp.now(),
                createdAt: Timestamp.now(),
            });

            revalidatePath("/manage/sites");
            revalidatePath("/manage/pages");
            await sleep(100); // Small delay to show progress
        }

        await batch.commit();

        // 5. Finalize the crawl
        await updateDoc(siteRef, { 
            status: "Active",
            lastCrawled: Timestamp.now(),
            pagesCrawled: uniqueLinks.length,
            currentlyCrawling: "Crawl complete."
        });

    } catch (error: any) {
        console.error("Error crawling site: ", error);
        await updateDoc(siteRef, { status: "Error", currentlyCrawling: `Crawl failed: ${error.message}` });
    } finally {
        revalidatePath("/manage/sites");
    }
}
