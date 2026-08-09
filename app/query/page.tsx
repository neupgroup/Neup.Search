import { Suspense } from 'react'
import HeaderS2V2 from '@/components/header.s2.v2'
import AIQA from '@/components/ai-qa'
import SearchResultsTabs from '@/components/search-results-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { performSearch } from '../search/actions'

export const dynamic = 'force-dynamic'

async function SearchResults({ query }: { query: string }) {
  const results = await performSearch(query)
  return <SearchResultsTabs query={query} initialWebResults={results} />
}


export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key:string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams;
  const query = (resolvedSearchParams?.q as string) || ''

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <HeaderS2V2 initialQuery={query} showSearch />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto grid gap-8">
          <Suspense fallback={<AIQASkeleton />}>
            <AIQA query={query} />
          </Suspense>
          <Suspense fallback={<SearchResultsSkeleton />}>
            <SearchResults query={query} />
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
