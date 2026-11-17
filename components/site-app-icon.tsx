/*
::neup.documentation::site-app-icon

Shared site/property icon renderer with image fallback.

::end
*/

"use client"

import { useState } from "react"
import { Globe } from "lucide-react"
import { getProxiedImageUrl } from "@/services/properties/imageProxy"

export function SiteAppIcon({
  name,
  url,
  appIconUrl,
  appIconBackgroundColor,
  className = "h-10 w-10",
  imageClassName = "h-6 w-6",
}: {
  name?: string
  url: string
  appIconUrl?: string
  appIconBackgroundColor?: string
  className?: string
  imageClassName?: string
}) {
  const [hasImageError, setHasImageError] = useState(!appIconUrl)
  const proxiedImageUrl = getProxiedImageUrl(appIconUrl)

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted ${className}`}
      style={appIconBackgroundColor ? { backgroundColor: appIconBackgroundColor } : undefined}
    >
      {proxiedImageUrl && !hasImageError ? (
        <img
          src={proxiedImageUrl}
          alt={`${name || url} icon`}
          className={`object-contain ${imageClassName}`}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <Globe className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  )
}
