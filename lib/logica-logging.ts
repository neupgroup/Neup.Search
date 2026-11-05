"use server"

import { logger } from "@neup/logica/logger"

// Convert Error instances and nested data into a serializable provider payload.
function serializeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serializeLogValue(value.cause, seen),
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeLogValue(item, seen))
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]"
    seen.add(value)
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeLogValue(nestedValue, seen)]),
    )
  }

  return value
}

// Send application errors to the Neup external logging provider.
export async function logError(error: unknown, context: string) {
  try {
    const projectId =
      process.env.NEXT_PUBLIC_NEUP_LOGGER_ID?.trim() ||
      process.env.NEXT_PUBLIC_NEUP_LOGGER_PROJECT_ID?.trim()

    if (projectId && !process.env.NEXT_PUBLIC_NEUP_LOGGER_ID) {
      process.env.NEXT_PUBLIC_NEUP_LOGGER_ID = projectId
    }

    const response = await logger()
      .type("error")
      .error({ context, error: serializeLogValue(error) })

    if (!response.ok) {
      console.error(`[${context}] Neup logger rejected the error.`, response.status, response.body?.error)
    }
  } catch (loggingError) {
    console.error(`[${context}] Could not send error to Neup logger.`, loggingError)
  }
}
