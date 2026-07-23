import Link from "next/link"
import { AlertTriangle, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCrawlIssues } from "../../../../services/neupbot"

export const dynamic = "force-dynamic"

function getBadgeVariant(type: string) {
  if (type === "Redirect") return "secondary"
  if (type === "Skipped") return "outline"
  return "destructive"
}

export default async function ManageCrawlErrorsPage() {
  const issues = await getCrawlIssues()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle>Crawl Errors</CardTitle>
        </div>
        <CardDescription>
          Pages with redirect, missing, failed, or skipped crawl responses from the page index.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Last Crawled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No crawl errors or redirects found.
                </TableCell>
              </TableRow>
            )}
            {issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell className="max-w-[360px]">
                  <Link href={`/manage/pages/${issue.id}`} className="font-medium hover:underline">
                    {issue.title}
                  </Link>
                  <div className="mt-1 break-all text-xs text-muted-foreground">{issue.url}</div>
                </TableCell>
                <TableCell className="break-all">{issue.domain}</TableCell>
                <TableCell>
                  <Badge variant={getBadgeVariant(issue.type)}>{issue.type}</Badge>
                </TableCell>
                <TableCell>{issue.statusCode ?? issue.status}</TableCell>
                <TableCell className="max-w-[320px]">
                  {issue.targetUrl ? (
                    <Link
                      href={issue.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all text-sm text-primary hover:underline"
                    >
                      {issue.targetUrl}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {issue.lastCrawled ? issue.lastCrawled.toLocaleString() : issue.addedOn.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
