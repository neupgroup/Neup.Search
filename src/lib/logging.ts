
"use server"

import { prisma } from "./prisma";

export async function logError(error: any, context: string) {
  try {
    let errorMessage: string;
    let errorStack: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    } else if (typeof error === "object" && error !== null) {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }

    await prisma.systemError.create({
      data: {
        message: errorMessage,
        stack: errorStack || null,
        context,
      },
    });
  } catch (dbError) {
    console.error("Failed to log error to database:", dbError);
    console.error("Original Error:", { error, context });
  }
}
