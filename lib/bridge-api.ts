import { NextResponse } from "next/server"

// Build a JSON response with a consistent API envelope.
export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status })
}

// Return a JSON error response with a stable message shape.
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status })
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
