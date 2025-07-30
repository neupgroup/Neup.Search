
"use server"

import { collection, getDocs, Timestamp, query, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type Page = {
  id: string;
  url: string;
  siteUrl: string;
  status: "Indexed" | "Error" | "Pending";
  lastIndexed: string | null;
  createdAt: Date;
}

export async function getPages(): Promise<Page[]> {
    try {
        const pagesCollection = collection(db, "pages");
        const q = query(pagesCollection, orderBy("createdAt", "desc"));
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
        return pagesList;
    } catch (error) {
        console.error("Error fetching pages: ", error);
        return [];
    }
}
