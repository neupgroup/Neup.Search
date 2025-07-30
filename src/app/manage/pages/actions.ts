

"use server"

import { collection, getDocs, Timestamp, query, orderBy, getDoc, doc, limit, startAfter, where, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { logError } from "@/lib/logging"
import { revalidatePath } from "next/cache"
import { summarizePageContent } from "@/ai/flows/summarize-page-flow"

export type Page = {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  status: "Indexed" | "Error" | "Pending";
  lastIndexed: string | null;
  createdAt: Date;
  description?: string;
  summary?: string;
  content?: string;
}

export type Backlink = {
    id: string;
    sourceUrl: string;
    sourceTitle: string;
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
        await logError(error, "getPages");
        return { pages: [], lastVisibleId: null };
    }
}

export async function getPageById(pageId: string): Promise<Page | null> {
    try {
        const pageDoc = await getDoc(doc(db, "pages", pageId));
        if (!pageDoc.exists()) {
            return null;
        }
        const data = pageDoc.data();
        return {
            id: pageDoc.id,
            url: data.url,
            title: data.title || 'No title',
            description: data.description,
            summary: data.summary,
            content: data.content,
            siteUrl: data.siteUrl,
            status: data.status,
            lastIndexed: data.lastIndexed ? (data.lastIndexed as Timestamp).toDate().toLocaleDateString() : 'Never',
            createdAt: (data.createdAt as Timestamp).toDate(),
        };
    } catch (error) {
        await logError({ error, pageId }, "getPageById");
        return null;
    }
}

export async function getBacklinks(pageUrl: string): Promise<Backlink[]> {
    try {
        const linksCollection = collection(db, "links");
        const q = query(linksCollection, where("targetUrl", "==", pageUrl), limit(100));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return [];
        }

        const backlinks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                sourceUrl: data.sourceUrl,
                sourceTitle: data.sourceTitle || data.sourceUrl,
            };
        });

        return backlinks;
    } catch (error) {
        await logError({ error, pageUrl }, "getBacklinks");
        return [];
    }
}

export async function summarizePageAction(pageId: string, pageContent: string) {
    const pageRef = doc(db, "pages", pageId);
    try {
        const { summary } = await summarizePageContent({ content: pageContent });
        
        await updateDoc(pageRef, {
            summary: summary,
        });

    } catch (error) {
       await logError({ error, pageId }, "summarizePageAction");
    } finally {
        revalidatePath(`/manage/pages/${pageId}`);
    }
}
