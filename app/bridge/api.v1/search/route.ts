import { NextRequest } from "next/server"
import { jsonError, jsonResponse } from "@/lib/bridge-api"
import { performSearch } from "@/app/search/actions"

// Search indexed pages using a query string.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || ""
  if (!query) return jsonError("The q query parameter is required.", 400)

  const results = await performSearch(query)
  return jsonResponse({ query, results })
}
