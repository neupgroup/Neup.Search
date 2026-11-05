/*
::neup.documentation::content-filter-bar

Client-side search and delayed tag visibility for manage content filters.

::end
*/

"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"

import { SearchInput } from "@/components/search-input"
import { Badge } from "@neup/components/ui/badge"

export function ContentFilterBar({
  tags,
}: {
  tags: Array<{ label: string; href: string }>
}) {
  const [showTags, setShowTags] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        return
      }

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }

      hideTimeoutRef.current = setTimeout(() => {
        setShowTags(false)
        hideTimeoutRef.current = null
      }, 5000)
    }

    window.addEventListener("mousedown", handlePointerDown)

    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  const revealTags = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTags(true)
  }

  return (
    <div ref={wrapperRef} className="space-y-4">
      <div className="relative flex-1 md:grow-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <SearchInput
          placeholder="Search content..."
          onFocus={revealTags}
          onClick={revealTags}
        />
      </div>

      <div
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
          showTags
            ? "max-h-40 translate-y-0 opacity-100"
            : "max-h-0 -translate-y-1 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <Link key={tag.href} href={tag.href}>
              <Badge variant="outline" className="px-3 py-1 text-sm transition-colors hover:bg-muted">
                {tag.label}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
