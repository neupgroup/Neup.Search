import { jsonMethodNotAllowed, jsonNotFound } from "@/lib/bridge-api"

// Return JSON for unknown bridge API paths.
export const GET = jsonNotFound
export const POST = jsonNotFound
export const PUT = jsonNotFound
export const PATCH = jsonNotFound
export const DELETE = jsonNotFound
export const OPTIONS = jsonNotFound
export const HEAD = jsonNotFound

// Return JSON for unsupported methods on unknown bridge API paths.
export const TRACE = jsonMethodNotAllowed
