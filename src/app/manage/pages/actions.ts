
"use server"

import { collection, getDocs, Timestamp, query, orderBy, getDoc, doc, limit, startAfter, where, startAt, endAt } from "firebase/firestore"
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

export async function getPages(search?: string, startAfterDocId?: string): Promise<PaginatedPages> {
    try {
        const pagesCollection = collection(db, "pages");
        
        let queryConstraints = [orderBy("createdAt", "desc"), limit(20)];

        if (search) {
             queryConstraints = [
                orderBy("url"),
                startAt(search),
                endAt(search + '\uf8ff'),
                limit(20)
            ];
        }

        if (startAfterDocId && !search) {
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
