import categoryTree from "@/services/categories/categories.json"

type CategoryTree = Record<string, unknown>

// Collect leaf page names when the saved site category is a taxonomy root.
function collectPageCategoryLeaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string")
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(collectPageCategoryLeaves)
}

// Read the page category leaves associated with the site's saved category path.
function getSitePageCategories(siteCategory: string | null): string[] {
  if (!siteCategory) return []
  const path = siteCategory.split(".").filter(Boolean)
  if (path[0] === "generic") return []
  let value: unknown = categoryTree as CategoryTree

  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !(key in value)) return []
    value = (value as Record<string, unknown>)[key]
  }

  return collectPageCategoryLeaves(value)
}

// Collect all site-specific page category leaves from the taxonomy JSON.
function getAllSitePageCategories(): string[] {
  return Object.entries(categoryTree as CategoryTree)
    .filter(([root]) => root !== "generic")
    .flatMap(([, branch]) => collectPageCategoryLeaves(branch))
}

// Prepare the allowed categories for a single page insight request.
export function getCategorizationContext(siteCategory: string | null): string[] {
  const siteCategories = getSitePageCategories(siteCategory)
  return [...new Set([...siteCategories, ...getAllSitePageCategories(), "generic"])]
}

// Return the generic page categories used to resolve a generic page classification.
export function getGenericPageCategories(): string[] {
  const genericCategories = (categoryTree as CategoryTree).generic
  return Array.isArray(genericCategories) ? genericCategories.filter((entry): entry is string => typeof entry === "string") : []
}
