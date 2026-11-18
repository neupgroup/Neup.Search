import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

// Validate the shared secret used by standalone worker processes.
export function authorizeWorkerRequest(request: NextRequest): NextResponse | null {
  const configuredSecret = process.env.NEUP_WORKER_SECRET
  const authorization = request.headers.get("authorization")
  const suppliedSecret = authorization?.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!configuredSecret || !suppliedSecret) {
    return NextResponse.json({ success: false, error: { code: "unauthorized", description: "Worker authentication is required." } }, { status: 401 })
  }

  const expected = Buffer.from(configuredSecret)
  const supplied = Buffer.from(suppliedSecret)
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ success: false, error: { code: "unauthorized", description: "Worker authentication is invalid." } }, { status: 401 })
  }
  return null
}

// Return a consistent successful worker API response.
export function workerApiSuccess(result: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, result }, { status })
}

// Return a consistent worker API error response.
export function workerApiError(code: string, description: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: { code, description } }, { status })
}
