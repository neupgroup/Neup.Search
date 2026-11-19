import { prisma } from "@/lib/prisma"
import { deleteCategory } from "./actions"
import { CategoryCreateForm } from "./category-create-form"

function getCategoryTypeLabel(type: "page" | "site") {
  return type === "site" ? "Site" : "Page"
}

// Manage the site's page and site category hierarchy.
export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, type: true, name: true, parentId: true, parent: { select: { name: true } } },
  })

  return (
    <div className="max-w-4xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">Create and manage page and site categories.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Create category</h2>
        <CategoryCreateForm categories={categories.map((category) => ({
          id: category.id,
          type: category.type,
          name: category.name,
          parentName: category.parent?.name || null,
        }))} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All categories <span className="text-sm font-normal text-muted-foreground">({categories.length})</span></h2>
        {categories.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No categories yet.</div>
        ) : (
          <div className="divide-y rounded-md border">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">{getCategoryTypeLabel(category.type)}</span>
                    <span className="font-medium">{category.name}</span>
                  </div>
                  {category.parent ? <p className="mt-1 text-xs text-muted-foreground">Parent: {category.parent.name}</p> : null}
                </div>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <button type="submit" className="rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">Delete</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
