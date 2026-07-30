

"use client"

import Link from "next/link"
import Image from "next/image"
import { useTransition, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, PlusCircle, Search, Loader2, Play } from "lucide-react"
import { crawlSite, type Site, crawlAllSites, deleteSite } from "./actions"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"

function CrawlButton({ siteId, siteUrl, isCrawling }: { siteId: string, siteUrl: string, isCrawling: boolean }) {
  const [isPending, startTransition] = useTransition();
  
  const handleCrawl = () => {
    if (isCrawling || isPending) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append('siteId', siteId);
      formData.append('siteUrl', siteUrl);
      await crawlSite(formData)
    });
  };
  
  const handleSelect = (event: Event) => {
    // Prevent the dropdown from closing when we click
    event.preventDefault();
    // Manually trigger the crawl action
    handleCrawl();
  }

  return (
    <DropdownMenuItem onSelect={handleSelect} disabled={isCrawling || isPending}>
        {isCrawling || isPending ? 'Crawling...' : 'Force Scrape'}
    </DropdownMenuItem>
  )
}

function CrawlAllButton() {
    const [isPending, startTransition] = useTransition();

    const handleCrawlAll = () => {
        startTransition(async () => {
            await crawlAllSites();
        });
    }

    return (
         <Button onClick={handleCrawlAll} disabled={isPending}>
            {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <Play className="mr-2 h-4 w-4" />
            )}
            {isPending ? "Starting Crawlers..." : "Crawl All Sites"}
        </Button>
    )
}

function DeleteSiteMenuItem({ siteId, siteName }: { siteId: string, siteName: string }) {
  const [isPending, startTransition] = useTransition()

  const handleSelect = (event: Event) => {
    event.preventDefault()

    if (!window.confirm(`Delete ${siteName} and all crawled data for this site? This cannot be undone.`)) {
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.append("siteId", siteId)
      await deleteSite(formData)
    })
  }

  return (
    <DropdownMenuItem onSelect={handleSelect} disabled={isPending} className="text-red-600">
      {isPending ? "Deleting..." : "Delete"}
    </DropdownMenuItem>
  )
}

export default function ManageSitesClientPage({ sites, lastVisibleId }: { sites: Site[], lastVisibleId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const startAfter = searchParams.get('startAfter');

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set('q', term);
    } else {
      params.delete('q');
    }
    params.delete('startAfter'); // Reset pagination on new search
    router.replace(`${pathname}?${params.toString()}`);
  }, 300);

  useEffect(() => {
    const isCrawling = sites.some(site => site.status === 'Crawling' || site.currentlyCrawling === 'Summarizing site...');
    if (isCrawling) {
      const interval = setInterval(() => {
        router.refresh();
      }, 2000); // Refresh every 2 seconds
      return () => clearInterval(interval);
    }
  }, [sites, router]);
  
  const handleNextPage = () => {
    if (lastVisibleId) {
       const params = new URLSearchParams(searchParams);
       params.set('startAfter', lastVisibleId);
       router.push(`${pathname}?${params.toString()}`);
    }
  };

  const handlePreviousPage = () => {
    // This simple version just goes back to the first page.
    // A more robust implementation would store previous page cursors.
    const params = new URLSearchParams(searchParams);
    params.delete('startAfter');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crawled Sites</CardTitle>
        <CardDescription>
          Manage the list of websites to be crawled and indexed.
        </CardDescription>
        <div className="flex items-center justify-between pt-4 gap-2">
            <div className="relative flex-1 md:grow-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search sites..."
                    className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
                    onChange={(e) => handleSearch(e.target.value)}
                    defaultValue={searchParams.get('q') || ''}
                />
            </div>
            <div className="flex gap-2">
                <CrawlAllButton />
                <Link href="/manage/sites/new">
                    <Button>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Add New Site
                    </Button>
                </Link>
            </div>
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
                        No sites found.
                    </TableCell>
                </TableRow>
            )}
            {sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell className="font-medium">
                  <Link href={`/manage/sites/${site.id}`} className="hover:underline flex items-center gap-3">
                     {site.logoUrl ? (
                      <Image 
                        src={site.logoUrl} 
                        alt={`${site.name || site.url} logo`} 
                        width={24} 
                        height={24} 
                        className="rounded-sm"
                      />
                    ) : (
                      <div className="w-6 h-6 bg-muted rounded-sm" />
                    )}
                    <div>
                      <div>{site.name || site.url}</div>
                      {(site.status === 'Crawling' || (site.currentlyCrawling && site.currentlyCrawling !== "Crawl complete.")) && (
                        <div className="text-xs text-muted-foreground mt-1">
                          [pages crawled: {site.pagesCrawled ?? 0} | currently: {site.currentlyCrawling ?? 'N/A'}]
                        </div>
                      )}
                       {site.status === 'Error' && site.currentlyCrawling && (
                         <div className="text-xs text-destructive mt-1">
                            {site.currentlyCrawling}
                        </div>
                       )}
                    </div>
                  </Link>
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
                      <DeleteSiteMenuItem siteId={site.id} siteName={site.name || site.url} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <div className="flex justify-end gap-2 w-full">
            <Button onClick={handlePreviousPage} disabled={!startAfter}>Previous</Button>
            <Button onClick={handleNextPage} disabled={!lastVisibleId || sites.length < 20}>Next</Button>
        </div>
      </CardFooter>
    </Card>
  )
}
