
"use server"

import { collection, getDocs, Timestamp, query, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { logError } from "@/lib/logging";

export type SystemError = {
  id: string;
  message: string;
  context: string;
  stack?: string;
  createdAt: Date;
}

export async function getErrors(): Promise<SystemError[]> {
    try {
        const errorsCollection = collection(db, "system_errors");
        const q = query(errorsCollection, orderBy("createdAt", "desc"), limit(100));
        const errorSnapshot = await getDocs(q);

        const errorsList = errorSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                message: data.message,
                context: data.context,
                stack: data.stack,
                createdAt: (data.createdAt as Timestamp).toDate(),
            };
        });

        return errorsList;
    } catch (error) {
        // If we can't even get the errors, log it to console and return empty
        console.error("Failed to fetch system errors:", error)
        // We avoid calling logError here to prevent a potential infinite loop
        return [];
    }
}
