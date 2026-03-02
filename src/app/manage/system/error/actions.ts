
"use server"

import { prisma } from "@/lib/prisma"
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
        const errors = await prisma.systemError.findMany({
            orderBy: { createdAt: "desc" },
            take: 100
        });
        return errors.map((e: { id: string; message: string; context: string; stack: string | null; createdAt: Date; }) => ({
            id: e.id,
            message: e.message,
            context: e.context,
            stack: e.stack || undefined,
            createdAt: e.createdAt
        }));
    } catch (error) {
        // If we can't even get the errors, log it to console and return empty
        console.error("Failed to fetch system errors:", error)
        // We avoid calling logError here to prevent a potential infinite loop
        return [];
    }
}
