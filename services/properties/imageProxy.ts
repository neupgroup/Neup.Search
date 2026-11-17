// Build the same-origin image endpoint URL for a remote favicon or logo.
export function getProxiedImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl

  const basePath = process.env.NEXT_PUBLIC_APP_BASEPATH ?? ""
  const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "")
  const routeBasePath = `/${normalizedBasePath || "search"}`
  return `${routeBasePath}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
}
