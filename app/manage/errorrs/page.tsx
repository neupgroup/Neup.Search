import Link from "next/link"
import { Suspense } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { getCrawlIssues } from "@/services/neupbot"

export const dynamic = "force-dynamic"

// Render crawl error rows after the page heading has streamed.
async function CrawlErrorsList() {
  const issues = await getCrawlIssues()

  return (
    <>
      {issues.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            No crawl errors or redirects found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <Link key={issue.id} href={`/manage/pages/${issue.id}`} className="block">
              <Card className="w-full transition-colors hover:bg-muted/50">
                <CardContent className="p-4">
                  <div className="font-medium leading-none">
                    {issue.title} ({issue.statusCode ?? issue.status})
                  </div>
                  <div className="mt-2 break-all text-sm text-muted-foreground">{issue.url}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

// Match the crawl error row layout while the error query is running.
function CrawlErrorsSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading crawl errors" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-72 max-w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Render the crawl error page shell before loading its rows.
export default function ManageCrawlErrorsPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Crawl Errors</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pages with redirect, missing, failed, or skipped crawl responses from the page index.
        </p>
      </div>
      <Suspense fallback={<CrawlErrorsSkeleton />}>
        <CrawlErrorsList />
      </Suspense>
    </div>
  )
}
