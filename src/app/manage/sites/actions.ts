"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { collection, addDoc, getDocs, Timestamp, query, orderBy } from "firebase/firestore"
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
  status: "Pending" | "Active" | "Paused" | "Error";
  lastCrawled: string | null;
  createdAt: Date;
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
            };
        });
        return sitesList;
    } catch (error) {
        console.error("Error fetching sites: ", error);
        return [];
    }
}
