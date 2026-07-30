import HeaderS2V2 from "@/components/header.s2.v2"

export default function SuggestionsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HeaderS2V2 />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold leading-none tracking-tight">Suggestions</h1>
            <p className="text-sm text-muted-foreground">
              Search suggestions and discovery ideas will appear here.
            </p>
          </div>

          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            No suggestions available yet.
          </div>
        </div>
      </main>
    </div>
  )
}
