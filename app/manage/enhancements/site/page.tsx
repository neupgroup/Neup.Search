import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { readDetails } from "@/services/projects/view"
import { saveSiteEnhancements } from "../../sites/actions"
import { CategoryTags } from "./category-tags"

// Configure the selected site's homepage title, category, and JavaScript behavior.
export default async function SiteEnhancementsPage({ searchParams }: { searchParams: Promise<{ property?: string | string[] }> }) {
  const params = await searchParams
  const selectedPropertyId = Array.isArray(params.property) ? params.property[0] : params.property
  if (!selectedPropertyId) redirect("/manage/projects")

  const site = await prisma.domain.findUnique({
    where: { id: selectedPropertyId },
    select: { id: true, domain: true, name: true, categories: true, details: true },
  }) || await prisma.domain.findUnique({
    where: { domain: selectedPropertyId },
    select: { id: true, domain: true, name: true, categories: true, details: true },
  })
  if (!site) redirect("/manage/projects")

  const details = readDetails(site.details)
  const categories = await prisma.category.findMany({
    where: { type: "site" },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    select: { name: true, parent: { select: { name: true } } },
  })

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Site Enhancements</h1>
        <p className="text-sm text-muted-foreground">Configure homepage metadata and crawling behavior for {site.domain}.</p>
      </header>

      <form action={saveSiteEnhancements} className="space-y-6">
        <input type="hidden" name="siteId" value={site.id} />

        <div className="space-y-2">
          <div className="text-sm font-medium">Site category</div>
          <CategoryTags
            categories={categories.map((category) => category.name)}
            value={categories.some((category) => category.name === site.categories) ? site.categories || "" : ""}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="homepageTitle" className="text-sm font-medium">Homepage title</label>
          <input id="homepageTitle" name="homepageTitle" defaultValue={details.homepageTitle || site.name || ""} maxLength={256} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" placeholder="Enter the title to use for the homepage" />
          <p className="text-xs text-muted-foreground">When set, this title is used when the homepage is crawled.</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">JavaScript requirements</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <input type="radio" name="javascriptMode" value="required" defaultChecked={details.javascriptMode === "required"} required className="mt-1" />
            <span><span className="block text-sm font-medium">JavaScript heavy</span><span className="block text-xs text-muted-foreground">Render pages with JavaScript during crawling.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
            <input type="radio" name="javascriptMode" value="not-required" defaultChecked={details.javascriptMode === "not-required"} required className="mt-1" />
            <span><span className="block text-sm font-medium">Does not require JavaScript</span><span className="block text-xs text-muted-foreground">Use the server response without browser rendering.</span></span>
          </label>
          {!details.javascriptMode ? <p className="text-xs text-muted-foreground">No preference is saved yet. Crawling will automatically detect whether rendering is needed.</p> : null}
        </fieldset>

        <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save changes</button>
      </form>
    </div>
  )
}
