import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

const maximumImageBytes = 5 * 1024 * 1024
const allowedImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
])

// Identify public IPv4 addresses before making an outbound image request.
function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [first, second, third] = octets
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && (second === 168 || (second === 0 && third === 0) || (second === 0 && third === 2))) return false
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return false
  if (first === 203 && second === 0 && third === 113) return false
  return true
}

// Reject private, local, and reserved IPv6 addresses from the image proxy.
function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0]
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedIpv4) return isPublicIpv4(mappedIpv4[1])
  const mappedHex = normalized.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/)
  if (mappedHex) {
    const packed = (Number.parseInt(mappedHex[1], 16) * 0x10000 + Number.parseInt(mappedHex[2], 16)) >>> 0
    return isPublicIpv4([packed >>> 24, (packed >>> 16) & 255, (packed >>> 8) & 255, packed & 255].join("."))
  }

  const firstBlock = Number.parseInt(normalized.split(":")[0] || "0", 16)
  if (normalized === "::" || normalized === "::1") return false
  if ((firstBlock & 0xe000) !== 0x2000) return false
  if (normalized.startsWith("2001:db8:")) return false
  if (normalized.startsWith("2001:0000:") || normalized.startsWith("2002:")) return false
  return true
}

// Verify that a URL resolves exclusively to public IP addresses.
async function isPublicImageHost(hostname: string): Promise<boolean> {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")
  if (!normalizedHostname || normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) return false

  const addressType = isIP(normalizedHostname)
  if (addressType === 4) return isPublicIpv4(normalizedHostname)
  if (addressType === 6) return isPublicIpv6(normalizedHostname)

  try {
    const addresses = await lookup(normalizedHostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every(({ address }) => isIP(address) === 4 ? isPublicIpv4(address) : isPublicIpv6(address))
  } catch {
    return false
  }
}

// Read an image response body while enforcing an upper size limit.
async function readLimitedImageBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maximumImageBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const image = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    image.set(chunk, offset)
    offset += chunk.byteLength
  }
  return image
}

// Proxy public remote favicon and logo images through the application origin.
export async function GET(request: Request) {
  const requestedUrl = new URL(request.url).searchParams.get("url")
  if (!requestedUrl || requestedUrl.length > 2048) return new Response("Invalid image URL.", { status: 400 })

  let remoteUrl: URL
  try {
    remoteUrl = new URL(requestedUrl)
  } catch {
    return new Response("Invalid image URL.", { status: 400 })
  }
  if (remoteUrl.protocol !== "http:" && remoteUrl.protocol !== "https:") return new Response("Unsupported image URL.", { status: 400 })
  if (remoteUrl.username || remoteUrl.password) return new Response("Unsupported image URL.", { status: 400 })
  if (remoteUrl.port && remoteUrl.port !== "80" && remoteUrl.port !== "443") return new Response("Unsupported image URL port.", { status: 400 })

  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
      if (!(await isPublicImageHost(remoteUrl.hostname))) return new Response("Image host is not allowed.", { status: 400 })

      const upstreamResponse = await fetch(remoteUrl, {
        headers: { "User-Agent": "NeupSearchImageProxy/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      })
      if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
        const location = upstreamResponse.headers.get("location")
        if (!location || redirectCount === 3) return new Response("Image redirect could not be followed.", { status: 502 })
        remoteUrl = new URL(location, remoteUrl)
        if (remoteUrl.protocol !== "http:" && remoteUrl.protocol !== "https:") return new Response("Unsupported image redirect.", { status: 502 })
        if (remoteUrl.port && remoteUrl.port !== "80" && remoteUrl.port !== "443") return new Response("Unsupported image redirect port.", { status: 502 })
        continue
      }

      if (!upstreamResponse.ok) return new Response("Image could not be fetched.", { status: 502 })
      const contentType = (upstreamResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
      if (!allowedImageTypes.has(contentType)) return new Response("Remote resource is not an image.", { status: 415 })
      const contentLength = Number(upstreamResponse.headers.get("content-length"))
      if (Number.isFinite(contentLength) && contentLength > maximumImageBytes) return new Response("Image is too large.", { status: 413 })

      const image = await readLimitedImageBody(upstreamResponse)
      if (!image || image.byteLength === 0) return new Response("Image is too large or empty.", { status: 413 })
      return new Response(image, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
  } catch {
    return new Response("Image could not be fetched.", { status: 502 })
  }

  return new Response("Image redirect limit exceeded.", { status: 502 })
}
