
"use server"

import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function logError(error: any, context: string) {
    try {
        const errorCollection = collection(db, "system_errors");
        
        let errorMessage: string;
        let errorStack: string | undefined;

        if (error instanceof Error) {
            errorMessage = error.message;
            errorStack = error.stack;
        } else if (typeof error === 'object' && error !== null) {
            errorMessage = JSON.stringify(error);
        } else {
            errorMessage = String(error);
        }

        await addDoc(errorCollection, {
            message: errorMessage,
            stack: errorStack || "N/A",
            context: context,
            createdAt: Timestamp.now(),
        });
    } catch (dbError) {
        // If logging to Firestore fails, log to the console as a last resort.
        console.error("Failed to log error to Firestore:", dbError);
        console.error("Original Error:", { error, context });
    }
}
