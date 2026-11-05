import { NextResponse } from "next/server"

// Build a JSON response with a consistent API envelope.
export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json({ success: true, result: data }, { status })
}

// Return a JSON error response with a stable message shape.
export function jsonError(message: string, status: number, code = "api_error") {
  return NextResponse.json({
    success: false,
    error: { code, description: message },
  }, { status })
}

// Return a JSON 404 for paths that do not match a bridge API endpoint.
export function jsonNotFound() {
  return jsonError("API route not found.", 404)
}

// Return a JSON 405 for methods that an endpoint does not support.
export function jsonMethodNotAllowed() {
  return jsonError("Method not allowed.", 405)
}

// Convert unexpected bridge API failures into the standard JSON error shape.
export function withJsonErrors<T extends (...args: any[]) => Promise<NextResponse>>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch {
      return jsonError("An unexpected API error occurred.", 500)
    }
  }) as T
}

// Parse the application's slug--id resource identifier.
export function parseResourceSlug(slug: string): { id: string; slug: string } | null {
  const separatorIndex = slug.lastIndexOf("--")
  if (separatorIndex <= 0 || separatorIndex === slug.length - 2) return null

  return {
    slug: slug.slice(0, separatorIndex),
    id: slug.slice(separatorIndex + 2),
  }
}

// Convert a project name into the lowercase URL slug form.
export function toProjectSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
