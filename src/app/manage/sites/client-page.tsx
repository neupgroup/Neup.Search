
"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, PlusCircle, Search } from "lucide-react"
import { crawlSite, type Site } from "./actions"

function CrawlButton({ siteId, siteUrl, isCrawling }: { siteId: string, siteUrl: string, isCrawling: boolean }) {
  const [isPending, startTransition] = useTransition();
  
  const handleCrawl = () => {
    if (isCrawling || isPending) {
      return;
    }
    startTransition(async () => {
      await crawlSite(siteId, siteUrl)
    });
  };
  
  const handleSelect = (event: Event) => {
    // Prevent the dropdown from closing when we click "Recrawl"
    event.preventDefault();
    // Manually trigger the crawl action
    handleCrawl();
  }

  return (
    <DropdownMenuItem onSelect={handleSelect} disabled={isCrawling || isPending}>
        {isCrawling || isPending ? 'Crawling...' : 'Recrawl'}
    </DropdownMenuItem>
  )
}

export default function ManageSitesClientPage({ sites }: { sites: Site[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crawled Sites</CardTitle>
        <CardDescription>
          Manage the list of websites to be crawled and indexed.
        </CardDescription>
        <div className="flex items-center justify-between pt-4">
            <div className="relative flex-1 md:grow-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search sites..."
                    className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
                />
            </div>
            <Link href="/manage/sites/new">
                <Button>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add New Site
                </Button>
            </Link>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Crawled</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {sites.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        No sites found. Add one to get started.
                    </TableCell>
                </TableRow>
            )}
            {sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell className="font-medium">
                  <div>{site.url}</div>
                  {(site.status === 'Active' || site.status === 'Crawling') && site.lastCrawled !== 'Never' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      [pages crawled: {site.pagesCrawled ?? 0} | currently crawling: {site.currentlyCrawling ?? 'N/A'}]
                    </div>
                  )}
                   {site.status === 'Error' && site.currentlyCrawling && (
                     <div className="text-xs text-destructive mt-1">
                        {site.currentlyCrawling}
                    </div>
                   )}
                </TableCell>
                <TableCell>
                  <Badge variant={
                      site.status === 'Active' ? 'default' 
                      : site.status === 'Crawling' ? 'default'
                      : site.status === 'Pending' ? 'outline'
                      : site.status === 'Paused' ? 'secondary' 
                      : 'destructive'
                  }>
                    {site.status}
                  </Badge>
                </TableCell>
                <TableCell>{site.lastCrawled}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                       <CrawlButton siteId={site.id} siteUrl={site.url} isCrawling={site.status === 'Crawling'} />
                      <DropdownMenuItem>Pause</DropdownMenuItem>
                      <DropdownMenuItem>View Logs</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
