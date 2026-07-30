/*
::neup.documentation::get-favicon

Resolve a property's favicon or manifest icon from its domain root.

::end
*/

import * as cheerio from "cheerio"

const defaultUserAgent = "NeupBot/1.0 (+https://neupgroup.com/neupbot; crawler.neupbot@neupgroup.com)"

function readManifestColor(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function getManifestIconScore(icon: { sizes?: unknown; purpose?: unknown }) {
  const sizes = typeof icon.sizes === "string" ? icon.sizes.split(/\s+/) : []
  const largestSize = sizes.reduce((maxSize, size) => {
    if (size === "any") return Math.max(maxSize, 4096)
    const match = size.match(/^(\d+)x(\d+)$/i)
    if (!match) return maxSize
    return Math.max(maxSize, Number.parseInt(match[1], 10), Number.parseInt(match[2], 10))
  }, 0)
  const purposeBonus = typeof icon.purpose === "string" && icon.purpose.includes("maskable") ? 10_000 : 0

  return purposeBonus + largestSize
}

function readManifestIconUrl(manifest: unknown, manifestUrl: string) {
  if (!manifest || typeof manifest !== "object" || !("icons" in manifest) || !Array.isArray(manifest.icons)) {
    return undefined
  }

  const icons = manifest.icons
    .filter(
      (icon): icon is { src: string; sizes?: unknown; purpose?: unknown } =>
        !!icon && typeof icon === "object" && "src" in icon && typeof icon.src === "string" && icon.src.trim().length > 0,
    )
    .sort((left, right) => getManifestIconScore(right) - getManifestIconScore(left))

  const selectedIcon = icons[0]
  if (!selectedIcon) return undefined

  try {
    return new URL(selectedIcon.src, manifestUrl).toString()
  } catch {
    return undefined
  }
}

async function readManifestBranding(manifestUrl: string, userAgent: string) {
  try {
    const response = await fetch(manifestUrl, {
      headers: { "user-agent": userAgent },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) {
      return null
    }

    const manifest = await response.json().catch(() => null)
    if (!manifest || typeof manifest !== "object") {
      return null
    }

    return {
      appIconUrl: readManifestIconUrl(manifest, response.url),
      appIconBackgroundColor:
        readManifestColor("background_color" in manifest ? manifest.background_color : undefined) ||
        readManifestColor("theme_color" in manifest ? manifest.theme_color : undefined),
    }
  } catch {
    return null
  }
}

async function readHomepageBranding(baseUrl: string, userAgent: string) {
  try {
    const response = await fetch(baseUrl, {
      headers: { "user-agent": userAgent },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    const responseUrl = response.url || baseUrl
    const manifestHref =
      $("link[rel=\"manifest\"]").attr("href") ||
      $("link[href$=\"manifest.json\"]").attr("href") ||
      $("link[href$=\"manifest.webmanifest\"]").attr("href")

    const iconHref =
      $("link[rel~=\"apple-touch-icon\"]").attr("href") ||
      $("link[rel~=\"icon\"][sizes]").first().attr("href") ||
      $("link[rel~=\"icon\"]").first().attr("href") ||
      $("link[rel=\"shortcut icon\"]").attr("href")

    const themeColor =
      $("meta[name=\"theme-color\"]").attr("content") ||
      $("meta[name=\"msapplication-TileColor\"]").attr("content")

    return {
      manifestUrl: manifestHref ? new URL(manifestHref, responseUrl).toString() : undefined,
      iconUrl: iconHref ? new URL(iconHref, responseUrl).toString() : undefined,
      appIconBackgroundColor: readManifestColor(themeColor),
    }
  } catch {
    return null
  }
}

async function resolveExistingAssetUrl(urls: string[], userAgent: string) {
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        return response.url || url
      }
    } catch {
    }
  }

  return undefined
}

export async function getFavicon(
  propertyAddress: string,
  options?: {
    currentBackgroundColor?: string
    userAgent?: string
  },
) {
  const userAgent = options?.userAgent || defaultUserAgent
  const httpsBaseUrl = `https://${propertyAddress}`
  const httpBaseUrl = `http://${propertyAddress}`

  for (const baseUrl of [httpsBaseUrl, httpBaseUrl]) {
    const homepageBranding = await readHomepageBranding(baseUrl, userAgent)

    if (homepageBranding?.manifestUrl) {
      const manifestBranding = await readManifestBranding(homepageBranding.manifestUrl, userAgent)

      if (manifestBranding?.appIconUrl || manifestBranding?.appIconBackgroundColor) {
        return {
          appIconUrl:
            manifestBranding.appIconUrl ||
            homepageBranding.iconUrl ||
            new URL("/favicon.ico", baseUrl).toString(),
          appIconBackgroundColor:
            manifestBranding.appIconBackgroundColor ||
            homepageBranding.appIconBackgroundColor ||
            options?.currentBackgroundColor,
        }
      }
    }

    if (homepageBranding?.iconUrl || homepageBranding?.appIconBackgroundColor) {
      return {
        appIconUrl: homepageBranding.iconUrl || new URL("/favicon.ico", baseUrl).toString(),
        appIconBackgroundColor: homepageBranding.appIconBackgroundColor || options?.currentBackgroundColor,
      }
    }

    for (const manifestPath of ["/manifest.json", "/manifest.webmanifest"]) {
      const manifestUrl = new URL(manifestPath, baseUrl).toString()
      const manifestBranding = await readManifestBranding(manifestUrl, userAgent)

      if (manifestBranding?.appIconUrl || manifestBranding?.appIconBackgroundColor) {
        return {
          appIconUrl: manifestBranding.appIconUrl || new URL("/favicon.ico", baseUrl).toString(),
          appIconBackgroundColor: manifestBranding.appIconBackgroundColor || options?.currentBackgroundColor,
        }
      }
    }
  }

  const faviconUrl = await resolveExistingAssetUrl([
    new URL("/favicon.ico", httpsBaseUrl).toString(),
    new URL("/favicon.ico", httpBaseUrl).toString(),
  ], userAgent)

  return {
    appIconUrl: faviconUrl,
    appIconBackgroundColor: options?.currentBackgroundColor,
  }
}
