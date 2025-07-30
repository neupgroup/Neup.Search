
"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, doc, updateDoc, Timestamp, query, orderBy, writeBatch } from "firebase/firestore"
import { z } from "zod"
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

    try {
        // 1. Set status to "Crawling"
        await updateDoc(siteRef, { status: "Crawling", currentlyCrawling: "Starting..." });
        revalidatePath("/manage/sites");
        await sleep(1000); // Give time for UI to update

        // 2. Simulate crawling a few pages
        const dummyPages = [
            '/',
            '/about',
            '/products',
            '/contact',
            '/blog/first-post',
        ];

        const batch = writeBatch(db);

        for (let i = 0; i < dummyPages.length; i++) {
            const pagePath = dummyPages[i];
            const fullUrl = `${siteUrl}${pagePath}`;
            
            await updateDoc(siteRef, { 
                currentlyCrawling: fullUrl,
                pagesCrawled: i + 1,
            });

            // Add page to the 'pages' collection
            const newPageRef = doc(collection(db, "pages"));
            batch.set(newPageRef, {
                url: fullUrl,
                siteUrl: siteUrl,
                status: "Indexed",
                lastIndexed: Timestamp.now(),
                createdAt: Timestamp.now(),
            });

            revalidatePath("/manage/sites");
            revalidatePath("/manage/pages"); // Revalidate pages too
            await sleep(1500); // Simulate time taken to crawl a page
        }

        // Commit all the new pages at once
        await batch.commit();

        // 3. Finalize the crawl
        await updateDoc(siteRef, { 
            status: "Active",
            lastCrawled: Timestamp.now(),
            currentlyCrawling: "Crawl complete."
        });

    } catch (error) {
        console.error("Error crawling site: ", error);
        await updateDoc(siteRef, { status: "Error", currentlyCrawling: "Crawl failed." });
    } finally {
        revalidatePath("/manage/sites");
    }
}
