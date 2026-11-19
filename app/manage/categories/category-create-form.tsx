"use client"

import { useState } from "react"
import { createCategory } from "./actions"

type CategoryOption = {
  id: string
  type: "page" | "site"
  name: string
  parentName: string | null
}

// Keep parent choices limited to the selected category type.
export function CategoryCreateForm({ categories }: { categories: CategoryOption[] }) {
  const [type, setType] = useState<"page" | "site">("page")
  const parentOptions = categories.filter((category) => category.type === type)

  return (
    <form action={createCategory} className="grid gap-3 sm:grid-cols-[150px_1fr_1fr_auto] sm:items-end">
      <label className="space-y-1 text-sm font-medium">
        Type
        <select name="type" required value={type} onChange={(event) => setType(event.target.value as "page" | "site")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal">
          <option value="page">Page</option>
          <option value="site">Site</option>
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Name
        <input name="name" required maxLength={120} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal" placeholder="Category name" />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Parent
        <select name="parentId" defaultValue="" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal">
          <option value="">None</option>
          {parentOptions.map((category) => <option key={category.id} value={category.id}>{category.parentName ? `${category.parentName} / ` : ""}{category.name}</option>)}
        </select>
      </label>
      <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Create</button>
    </form>
  )
}
