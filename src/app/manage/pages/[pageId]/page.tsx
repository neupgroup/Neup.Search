

import { notFound } from "next/navigation"
import { getPageById, getBacklinks, getPageSitemapReferences, summarizePageAction } from "../actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CrawlerDataPanel } from "./crawler-data-panel"

export default async function PageDetailPage({ params }: { params: Promise<{ pageId: string }> }) {
  const resolvedParams = await params;
  const page = await getPageById(resolvedParams.pageId)
  
  if (!page) {
    notFound()
  }

  const [backlinks, sitemapReferences] = await Promise.all([
    getBacklinks(page.url),
    getPageSitemapReferences(page),
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
