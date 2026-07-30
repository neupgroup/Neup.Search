

import Link from "next/link"
import Image from "next/image"
import { getSiteById, getPagesForSite } from "@/app/manage/sites/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { notFound, redirect } from "next/navigation"
import { RecrawlButton, CancelCrawlButton, UpdateSummaryButton, DeletePagesButton, JavascriptCrawlButton, ResumeCrawlButton, LiveCrawlStatus } from "./client"

function readPositiveInteger(value: string | string[] | undefined, fallback: number) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(rawValue || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildPagesLink(siteId: string, page: number, pageSize: number) {
  return `/manage/sites/${siteId}?page=${page}&pageSize=${pageSize}`
}

export default async function SiteDetailPage({ params, searchParams }: { params: Promise<{ siteId: string }>, searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const requestedPage = readPositiveInteger(resolvedSearchParams.page, 1)
  const requestedPageSize = readPositiveInteger(resolvedSearchParams.pageSize, 20)
  const site = await getSiteById(resolvedParams.siteId)
  
  if (!site) {
    notFound()
  }
  
  const pagination = await getPagesForSite(resolvedParams.siteId, requestedPage, requestedPageSize)
  const { pages, page, pageSize, totalCount, totalPages } = pagination

  if (requestedPage !== page || requestedPageSize !== pageSize) {
    redirect(buildPagesLink(resolvedParams.siteId, page, pageSize))
  }


  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {site.logoUrl && (
              <Image 
                src={site.logoUrl} 
                alt={`${site.name || site.url} logo`} 
                width={64} 
                height={64} 
                className="rounded-md border"
              />
            )}
            <div>
              <CardTitle className="text-2xl">{site.name || site.url}</CardTitle>
              <CardDescription>{site.summary || "No summary available."}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0">
             <div className="flex gap-2">
                <RecrawlButton siteId={site.id} siteUrl={site.url} status={site.status} />
                <ResumeCrawlButton siteId={site.id} status={site.status} />
                <JavascriptCrawlButton siteId={site.id} siteUrl={site.url} status={site.status} />
                {site.status === "Crawling" && (
                   <CancelCrawlButton siteId={site.id} />
                )}
             </div>
             <div className="flex gap-2">
                <UpdateSummaryButton siteId={site.id} siteUrl={site.url} />
                <DeletePagesButton siteId={site.id} siteName={site.name || site.url} />
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <LiveCrawlStatus
            siteId={site.id}
            initialStatus={{
              status: site.status,
              lastCrawled: site.lastCrawled,
              pagesCrawled: site.pagesCrawled ?? 0,
              internalResourcesFound: site.internalResourcesFound ?? 0,
              externalResourcesFound: site.externalResourcesFound ?? 0,
              currentlyCrawling: site.currentlyCrawling,
              currentCrawlUrl: site.currentCrawlUrl,
              createdAt: site.createdAt.toISOString(),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indexed Pages</CardTitle>
          <CardDescription>A list of all pages indexed for this site.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Indexed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    No pages have been indexed for this site yet.
                  </TableCell>
                </TableRow>
              )}
              {pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-medium break-all">
                     <Link href={`/manage/pages/${page.id}`} className="font-bold hover:underline">{page.title}</Link>
                    <div className="text-xs text-muted-foreground">{page.url}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={page.status === 'Indexed' ? 'default' : 'destructive'}>
                      {page.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{page.lastIndexed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
         <CardFooter>
            <div className="flex items-center justify-between gap-4 w-full">
                <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} | {totalCount.toLocaleString()} pages | {pageSize} per page
                </p>
                <div className="flex justify-end gap-2">
                <Link href={buildPagesLink(resolvedParams.siteId, Math.max(1, page - 1), pageSize)}>
                    <Button variant="outline" disabled={page <= 1}>Previous</Button>
                </Link>
                <Link href={buildPagesLink(resolvedParams.siteId, Math.min(totalPages, page + 1), pageSize)}>
                    <Button variant="outline" disabled={page >= totalPages}>Next</Button>
                </Link>
                </div>
            </div>
        </CardFooter>
      </Card>
    </div>
  )
}
