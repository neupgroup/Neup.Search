
"use server"

import { collection, getDocs, Timestamp, query, orderBy, getDoc, doc, limit, startAfter, where } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type Page = {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  status: "Indexed" | "Error" | "Pending";
  lastIndexed: string | null;
  createdAt: Date;
  description?: string;
}

export type PaginatedPages = {
    pages: Page[];
    lastVisibleId: string | null;
}

export async function getPages(search?: string, startAfterDocId?: string): Promise<PaginatedPages> {
    try {
        const pagesCollection = collection(db, "pages");
        
        let q: any;

        if (search) {
            const queryConstraints = [
                orderBy("url"),
                where('url', '>=', search),
                where('url', '<=', search + '\uf8ff'),
                limit(20)
            ];
             if (startAfterDocId) {
                const lastVisibleDoc = await getDoc(doc(db, "pages", startAfterDocId));
                queryConstraints.push(startAfter(lastVisibleDoc));
            }
            q = query(pagesCollection, ...queryConstraints);
        } else {
             const queryConstraints = [
                orderBy("createdAt", "desc"),
                limit(20)
            ];
            if (startAfterDocId) {
                const lastVisibleDoc = await getDoc(doc(db, "pages", startAfterDocId));
                queryConstraints.push(startAfter(lastVisibleDoc));
            }
            q = query(pagesCollection, ...queryConstraints);
        }

        const pageSnapshot = await getDocs(q);

        const pagesList = pageSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                url: data.url,
                title: data.title || 'No title',
                description: data.description || 'No description',
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
