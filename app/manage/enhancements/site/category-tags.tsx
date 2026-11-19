"use client"

import { useState } from "react"
import { Badge } from "@neup/components/ui/badge"

function formatCategoryLabel(value: string) {
  return value.split(".").map((part) => part.replaceAll("-", " ")).join(" / ")
}

// Choose one site category from a compact, selectable tag list.
export function CategoryTags({ categories, value }: { categories: string[]; value: string }) {
  const [selectedCategory, setSelectedCategory] = useState(value)

  return (
    <div className="space-y-3">
      <input type="hidden" name="category" value={selectedCategory} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Site categories">
        {categories.map((category) => {
          const selected = selectedCategory === category
          return (
            <Badge
              key={category}
              variant={selected ? "default" : "outline"}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => setSelectedCategory(selected ? "" : category)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setSelectedCategory(selected ? "" : category)
                }
              }}
              className={`cursor-pointer px-3 py-1.5 text-sm capitalize ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
            >
              {formatCategoryLabel(category)}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
