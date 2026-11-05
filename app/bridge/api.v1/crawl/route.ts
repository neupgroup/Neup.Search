import { NextRequest } from "next/server"
import { jsonError, jsonResponse } from "@/lib/bridge-api"
import { logError } from "@/lib/logica-logging"
import { createDomainForCrawl, InvalidDomainError, runCrawler } from "@/services/neupbot"

// Start a crawl for the submitted project URL.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("Request body must be valid JSON.", 400)
  }

  const url = body && typeof body === "object" && "url" in body && typeof body.url === "string"
    ? body.url.trim()
    : ""

  if (!url) return jsonError("The url field is required.", 400)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    return jsonError("Enter a domain or IP address without http:// or https://.", 400)
  }

  try {
    const { domain, siteUrl } = await createDomainForCrawl({ url: `https://${url}` })
    runCrawler(domain.id, siteUrl).catch((error) => logError(error, "api.crawl.async"))

    return jsonResponse({
      id: domain.id,
      slug: `${domain.domain}--${domain.id}`,
      url: siteUrl,
      status: domain.status,
    }, 202)
  } catch (error) {
    if (error instanceof InvalidDomainError) return jsonError(error.message, 400)
    await logError(error, "api.crawl")
    return jsonError("Could not start the crawl.", 500)
  }
}
