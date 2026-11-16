import { isIP } from "node:net"

// Error raised when a project URL does not contain a valid public hostname.
export class InvalidDomainError extends Error {
  constructor(message = "Please enter a valid domain.") {
    super(message)
    this.name = "InvalidDomainError"
  }
}

// Normalize a project URL for storage by removing fragments and root slashes.
export function normalizeSiteUrl(input: string): string {
  const url = new URL(input)
  url.hash = ""
  if (url.pathname === "/") url.pathname = ""
  return url.toString()
}

// Add HTTPS when a stored hostname is supplied without a URL scheme.
export function ensureHttpSiteUrl(input: string): string {
  const trimmedInput = input.trim()
  const absoluteUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedInput) ? trimmedInput : `https://${trimmedInput}`
  const url = new URL(absoluteUrl)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Site URL must use HTTP or HTTPS.")
  return url.toString()
}

// Return the lowercase hostname used as a project identifier.
export function getPropertyAddress(input: string): string {
  return new URL(input).hostname.toLowerCase().replace(/\.$/, "")
}

// Check whether a hostname uses valid DNS label syntax.
export function isValidDomainHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")
  if (!normalizedHostname || normalizedHostname.length > 253 || normalizedHostname.includes("..") || normalizedHostname === "localhost") return false
  const labels = normalizedHostname.split(".")
  const tld = labels[labels.length - 1]
  if (labels.length < 2 || tld.length < 2 || /^\d+$/.test(tld)) return false
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

// Validate a project URL's hostname before storing or crawling it.
export function assertValidSiteDomain(input: string): void {
  const hostname = getPropertyAddress(input)
  if (!(isIP(hostname) || isValidDomainHostname(hostname))) throw new InvalidDomainError()
}

// Return a URL's hostname for crawl scope checks.
export function getDomainName(input: string): string {
  return new URL(input).hostname
}

// Return the normalized hostname identifier for a project URL.
export function getDomainId(input: string): string {
  return getPropertyAddress(input)
}
