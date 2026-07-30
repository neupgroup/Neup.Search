

"use client"

import Link from "next/link"
import { useState, useTransition, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, PlusCircle, Search, Loader2, Play, Globe } from "lucide-react"
import { crawlSite, type Site, crawlAllSites, deleteSite } from "./actions"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"

function SiteIcon({ site }: { site: Site }) {
  const [hasImageError, setHasImageError] = useState(!site.appIconUrl)

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted"
      style={site.appIconBackgroundColor ? { backgroundColor: site.appIconBackgroundColor } : undefined}
    >
      {site.appIconUrl && !hasImageError ? (
        <img
          src={site.appIconUrl}
          alt={`${site.name || site.url} icon`}
          className="h-6 w-6 object-contain"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <Globe className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  )
}

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
  const propertyId = searchParams.get("property");
  const addSiteHref = propertyId
    ? `/manage/sites/new?property=${encodeURIComponent(propertyId)}`
    : "/manage/sites/new";

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

  const getCornerClass = (index: number) => {
    const isFirst = index === 0
    const isLast = index === sites.length - 1

    if (isFirst && isLast) return "rounded-lg"
    if (isFirst) return "rounded-t-lg rounded-b-none"
    if (isLast) return "rounded-b-lg rounded-t-none"
    return "rounded-none"
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1">
        <CardTitle>Crawled Sites</CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage the list of websites to be crawled and indexed.
        </p>
        </div>
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
                <Link href={addSiteHref}>
                    <Button>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Add New Site
                    </Button>
                </Link>
            </div>
        </div>
      </div>
      <div>
        {sites.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No sites found.
          </div>
        ) : (
          <div className="space-y-0">
            {sites.map((site, index) => {
              const siteHref = `/manage/sites/${site.id}`

              return (
              <Card
                key={site.id}
                className={`w-full cursor-pointer border-border/60 transition-colors hover:border-primary hover:bg-muted/40 ${getCornerClass(index)}`}
                onClick={() => router.push(siteHref)}
              >
                <CardContent className="p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <SiteIcon site={site} />
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold">{site.name || site.url}</div>
                        <div className="truncate text-sm text-muted-foreground">{site.url}</div>
                        {(site.status === 'Crawling' || (site.currentlyCrawling && site.currentlyCrawling !== "Crawl complete.")) && (
                          <div className="text-xs text-muted-foreground">
                            [pages crawled: {site.pagesCrawled ?? 0} | currently: {site.currentlyCrawling ?? 'N/A'}]
                          </div>
                        )}
                        {site.status === 'Error' && site.currentlyCrawling && (
                          <div className="text-xs text-destructive">
                            {site.currentlyCrawling}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <Badge variant={
                        site.status === 'Active' ? 'default'
                        : site.status === 'Crawling' ? 'default'
                        : site.status === 'Pending' ? 'outline'
                        : site.status === 'Paused' ? 'secondary'
                        : 'destructive'
                      }>
                        {site.status}
                      </Badge>
                      <div className="text-sm text-muted-foreground">{site.lastCrawled}</div>
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            )})}
          </div>
        )}
      </div>
      <div>
        <div className="flex justify-end gap-2 w-full">
            <Button onClick={handlePreviousPage} disabled={!startAfter}>Previous</Button>
            <Button onClick={handleNextPage} disabled={!lastVisibleId || sites.length < 20}>Next</Button>
        </div>
      </div>
    </div>
  )
}
