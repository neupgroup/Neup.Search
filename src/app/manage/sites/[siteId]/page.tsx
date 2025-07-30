
import Link from "next/link"
import { getSiteById, getPagesForSite, crawlSite } from "@/app/manage/sites/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { notFound } from "next/navigation"

export default async function SiteDetailPage({ params, searchParams }: { params: { siteId: string }, searchParams: { [key: string]: string | string[] | undefined } }) {
  const startAfter = searchParams.startAfter as string | undefined;
  const site = await getSiteById(params.siteId)
  
  if (!site) {
    notFound()
  }
  
  const { pages, lastVisibleId } = await getPagesForSite(params.siteId, startAfter)


  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{site.url}</CardTitle>
            <CardDescription>{site.description}</CardDescription>
          </div>
           <form action={async () => {
              "use server"
              await crawlSite(site.id, site.url)
           }}>
             <Button type="submit" disabled={site.status === "Crawling"}>
              {site.status === "Crawling" ? "Crawling..." : "Recrawl Site"}
            </Button>
           </form>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="font-semibold">Status</p>
              <Badge variant={
                  site.status === 'Active' ? 'default' 
                  : site.status === 'Crawling' ? 'default'
                  : site.status === 'Pending' ? 'outline'
                  : site.status === 'Paused' ? 'secondary' 
                  : 'destructive'
              }>
                {site.status}
              </Badge>
            </div>
            <div>
              <p className="font-semibold">Last Crawled</p>
              <p>{site.lastCrawled}</p>
            </div>
            <div>
              <p className="font-semibold">Pages Indexed</p>
              <p>{site.pagesCrawled}</p>
            </div>
            <div>
              <p className="font-semibold">Date Added</p>
              <p>{site.createdAt.toLocaleDateString()}</p>
            </div>
          </div>
          {(site.status === "Crawling" || site.currentlyCrawling) && (
             <div className="mt-4 text-sm">
                <p className="font-semibold">Current Activity</p>
                <p className="text-muted-foreground break-all">{site.currentlyCrawling}</p>
            </div>
          )}
           {site.status === 'Error' && site.currentlyCrawling && (
             <div className="mt-4 text-sm text-destructive">
                <p className="font-semibold">Error Details</p>
                <p>{site.currentlyCrawling}</p>
            </div>
            )}
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
                  <TableCell className="font-medium break-all">{page.url}</TableCell>
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
            <div className="flex justify-end gap-2 w-full">
                <Link href={`/manage/sites/${params.siteId}`}>
                    <Button variant="outline" disabled={!startAfter}>Previous</Button>
                </Link>
                <Link href={`/manage/sites/${params.siteId}?startAfter=${lastVisibleId}`}>
                    <Button variant="outline" disabled={!lastVisibleId || pages.length < 20}>Next</Button>
                </Link>
            </div>
        </CardFooter>
      </Card>
    </div>
  )
}
