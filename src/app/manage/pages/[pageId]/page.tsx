

import { notFound } from "next/navigation"
import { crawlPageAction, deletePageAction, getPageById, getBacklinks, getPageSitemapReferences, summarizePageAction } from "../actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { CrawlerDataPanel } from "./crawler-data-panel"
import { getPageIssues, type PageIssue } from "../../../../../services/neupbot"

function getIssueKindLabel(kind: PageIssue["kind"]) {
  if (kind === "link") return "Link"
  if (kind === "file") return "File"
  if (kind === "image-alt") return "Image alt"
  if (kind === "image-caption") return "Image caption"
  if (kind === "video-alt") return "Video label"
  return "Iframe"
}

function PageIssuesPanel({ issues }: { issues: PageIssue[] }) {
  const errorCount = issues.filter((issue) => issue.severity === "error").length
  const warningCount = issues.length - errorCount

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-xl font-semibold leading-none tracking-tight">Page Issues</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Broken links, missing files, media accessibility gaps, and iframe errors found on this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={errorCount > 0 ? "destructive" : "secondary"}>{errorCount} errors</Badge>
          <Badge variant="outline">{warningCount} warnings</Badge>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No link, file, image, video, or iframe issues found for this page.
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <Card key={issue.id} className="transition-colors hover:bg-muted/50">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={issue.severity === "error" ? "destructive" : "secondary"}>
                        {getIssueKindLabel(issue.kind)}
                      </Badge>
                      {issue.statusCode && <Badge variant="outline">{issue.statusCode}</Badge>}
                      <span className="font-medium">{issue.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{issue.message}</p>
                    {issue.url && (
                      <Link
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all text-sm text-muted-foreground hover:text-primary"
                      >
                        {issue.url}
                      </Link>
                    )}
                  </div>
                  {issue.status && (
                    <Badge variant={issue.severity === "error" ? "destructive" : "outline"} className="w-fit shrink-0">
                      {issue.status}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function getBacklinkDisplayText(link: { anchorText?: string | null; altText?: string | null; titleText?: string | null }) {
  return link.anchorText || link.altText || link.titleText || null
}

export default async function PageDetailPage({ params }: { params: Promise<{ pageId: string }> }) {
  const resolvedParams = await params;
  const page = await getPageById(resolvedParams.pageId)
  
  if (!page) {
    notFound()
  }

  const [backlinks, sitemapReferences, issues] = await Promise.all([
    getBacklinks(page.url),
    getPageSitemapReferences(page),
    getPageIssues(page.id),
  ])

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl break-all">{page.title}</CardTitle>
              <CardDescription>
                <Link href={page.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                  {page.url}
                </Link>
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <form action={crawlPageAction}>
                <input type="hidden" name="pageId" value={page.id} />
                <Button type="submit" variant="default">
                  Crawl Page
                </Button>
              </form>
              <form action={async () => {
                "use server"
                if (page.content) {
                    await summarizePageAction(page.id, page.content)
                }
              }}>
                <Button type="submit" variant="outline" disabled={!page.content || !!page.summary}>
                    {page.summary ? "Summary Generated" : "Generate Summary"}
                </Button>
              </form>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Page</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <form action={deletePageAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this page?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this indexed page and its recorded links.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button type="submit" variant="destructive">
                          Delete Page
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <h3 className="font-semibold text-lg mb-2">AI Generated Summary</h3>
          <p className="text-sm text-muted-foreground">
            {page.summary || "No summary has been generated for this page yet. Click the button above to create one."}
          </p>
        </CardContent>
      </Card>

      <CrawlerDataPanel url={page.url} />

      <PageIssuesPanel issues={issues} />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold leading-none tracking-tight">Linked From Pages</h2>
          <p className="text-sm text-muted-foreground">
            Pages that contain a link to this page.
          </p>
        </div>
        <div className="space-y-3">
              {backlinks.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No backlinks have been recorded for this page yet.
                </div>
              )}
              {backlinks.map((link) => (
                <Card key={link.id} className="transition-colors hover:bg-muted/50">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {link.sourcePageId ? (
                        <Link href={`/manage/pages/${link.sourcePageId}`} className="font-medium hover:underline">
                          {link.sourceTitle}
                        </Link>
                      ) : (
                        <div className="font-medium">{link.sourceTitle}</div>
                      )}
                      <Link
                        href={link.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all text-sm text-muted-foreground hover:text-primary"
                      >
                        {link.sourceUrl}
                      </Link>
                      {(link.sourceType || getBacklinkDisplayText(link)) && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {link.sourceType && <Badge variant="outline">{link.sourceType}</Badge>}
                          {getBacklinkDisplayText(link) && (
                            <span className="break-all">{getBacklinkDisplayText(link)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold leading-none tracking-tight">Listed In Sitemaps</h2>
          <p className="text-sm text-muted-foreground">
            Sitemaps that include this page URL.
          </p>
        </div>
        <div className="space-y-3">
          {sitemapReferences.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                This page has not been found in a sitemap yet.
            </div>
          )}
          {sitemapReferences.map((reference) => (
            <Card key={reference.sitemapUrl} className="transition-colors hover:bg-muted/50">
              <CardContent className="p-4">
                <Link
                  href={reference.sitemapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-sm font-medium hover:text-primary"
                >
                  {reference.sitemapUrl}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
