
"use server"

export async function logError(error: any, context: string) {
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

  console.error("Application error:", {
    context,
    message: errorMessage,
    stack: errorStack,
  });
}
