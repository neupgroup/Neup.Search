import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getCrawlIssues } from "@/services/neupbot"

export const dynamic = "force-dynamic"

export default async function ManageCrawlErrorsPage() {
  const issues = await getCrawlIssues()

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
    </div>
  )
}
