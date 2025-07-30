import { Suspense } from 'react'
import Header from '@/components/header'
import AIQA from '@/components/ai-qa'
import SearchResultsTabs from '@/components/search-results-tabs'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

export default function SearchPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const query = (searchParams?.q as string) || ''

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header initialQuery={query} />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto grid gap-8">
          <Suspense fallback={<AIQASkeleton />}>
            <AIQA query={query} />
          </Suspense>
          <Suspense fallback={<SearchResultsSkeleton />}>
            <SearchResultsTabs />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

function AIQASkeleton() {
  return (
    <div className="p-6 rounded-xl border bg-card shadow-sm space-y-4">
      <Skeleton className="h-6 w-1/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

function SearchResultsSkeleton() {
  return <Skeleton className="h-96 w-full rounded-xl" />
}
