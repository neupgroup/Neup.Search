import Link from "next/link"

// Show the available indexing management destination.
export default function IndexingPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Indexing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review pages discovered and indexed by NeupBot.</p>
      </div>
      <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/manage/pages">
        View indexed pages
      </Link>
    </section>
  )
}
