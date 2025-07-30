
"use server"

import { collection, getDocs, Timestamp, query, orderBy, getDoc, doc, limit, startAfter } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type Page = {
  id: string;
  url: string;
  siteUrl: string;
  status: "Indexed" | "Error" | "Pending";
  lastIndexed: string | null;
  createdAt: Date;
}

export type PaginatedPages = {
    pages: Page[];
    lastVisibleId: string | null;
}

export async function getPages(startAfterDocId?: string): Promise<PaginatedPages> {
    try {
        const pagesCollection = collection(db, "pages");
        let q;

        if (startAfterDocId) {
            const lastVisibleDoc = await getDoc(doc(db, "pages", startAfterDocId));
            q = query(pagesCollection, orderBy("createdAt", "desc"), startAfter(lastVisibleDoc), limit(20));
        } else {
            q = query(pagesCollection, orderBy("createdAt", "desc"), limit(20));
        }

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

        const lastVisible = pageSnapshot.docs[pageSnapshot.docs.length - 1];

        return {
            pages: pagesList,
            lastVisibleId: lastVisible ? lastVisible.id : null,
        }
    } catch (error) {
        console.error("Error fetching pages: ", error);
        return { pages: [], lastVisibleId: null };
    }
}
