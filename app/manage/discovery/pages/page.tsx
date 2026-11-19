import { Suspense } from "react"
import { Button } from "@neup/components/ui/button"
import { Badge } from "@neup/components/ui/badge"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { ExternalLink, Search } from "lucide-react"
import { getPages, type Page } from "../../pages/actions"
import Link from "next/link"
import { SearchInput } from "@/components/search-input"

function getStatusDotClass(page: Page) {
  if (page.statusCode && page.statusCode >= 400) return "bg-red-500"
  if (page.statusCode !== null && page.statusCode >= 400) return "bg-red-500"
  if ((page.statusCode !== null && page.statusCode >= 300 && page.statusCode < 400) || (page.statusCode && page.statusCode >= 300)) return "bg-orange-500"
  if (page.status === "analyzed" || page.status === "indexed") return "bg-green-500"
  if (page.domainStatus === "paused") return "bg-amber-500"
  if (page.status === "discovered" && page.domainStatus === "crawling") return "bg-slate-400"
  return "bg-blue-500"
}

function buildPageLink(params: { search?: string; page: number; pageSize: number; propertyId?: string }) {
  const query = new URLSearchParams({ page: String(params.page), pagesize: String(params.pageSize) })
  if (params.search) query.set("q", params.search)
  if (params.propertyId) query.set("property", params.propertyId)
  return `/manage/discovery/pages?${query.toString()}`
}

function buildPageDetailLink(pageId: string, propertyId?: string) {
  if (!propertyId) return `/manage/pages/${pageId}`
  return `/manage/pages/${pageId}?property=${encodeURIComponent(propertyId)}`
}

function readCountParam(value: string | string[] | undefined, fallback: number) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function PagesListSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <Card key={index}><CardContent className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-5 w-full max-w-lg" /><Skeleton className="h-4 w-full max-w-2xl" /></div><Skeleton className="h-3 w-3 shrink-0 rounded-full" /></div></CardContent></Card>)}</div>
}

async function PagesList({ search, page, pageSize, propertyId }: { search?: string; page: number; pageSize: number; propertyId?: string }) {
  const pagination = await getPages(search, page, pageSize, propertyId)
  const { pages, totalCount, totalPages } = pagination
  const previousPage = Math.max(1, pagination.page - 1)
  const nextPage = Math.min(totalPages, pagination.page + 1)

  return (
    <div className="space-y-4">
      <div className="space-y-0">
        {pages.length === 0 ? <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">No pages found.</CardContent></Card> : null}
        {pages.map((page, index) => {
          const cornerClass = index === 0 ? "rounded-t-lg rounded-b-none" : index === pages.length - 1 ? "rounded-b-lg rounded-t-none" : "rounded-none"
          return <Link key={page.id} href={buildPageDetailLink(page.id, propertyId)} className="block"><Card className={`border-border/60 transition-colors hover:border-primary hover:bg-muted/40 ${cornerClass}`}><CardContent className="p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-2"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getStatusDotClass(page)}`} /><div className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold leading-tight">{page.title}</div>{page.domainStatus === "paused" ? <Badge convey="warning">Site paused</Badge> : null}</div><Badge variant="secondary" className="ml-6 w-fit">Category: {page.category || "Uncategorized"}</Badge><div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted-foreground"><span className="block overflow-hidden text-ellipsis whitespace-nowrap">{page.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" /></div></div></div></CardContent></Card></Link>
        })}
      </div>
      {totalCount > 0 ? <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm text-muted-foreground">Page {pagination.page} of {totalPages} | {totalCount.toLocaleString()} pages</div><div className="flex justify-end gap-2"><Link href={buildPageLink({ search, page: previousPage, pageSize: pagination.pageSize, propertyId })}><Button variant="outline" disabled={pagination.page <= 1}>Previous</Button></Link><Link href={buildPageLink({ search, page: nextPage, pageSize: pagination.pageSize, propertyId })}><Button variant="outline" disabled={pagination.page >= totalPages}>Next</Button></Link></div></div> : null}
    </div>
  )
}

// Show crawled pages under Discovery with the selected property's filter preserved.
export default async function DiscoveryPagesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const search = Array.isArray(params.q) ? params.q[0] : params.q
  const propertyId = Array.isArray(params.property) ? params.property[0] : params.property
  const page = readCountParam(params.page, 1)
  const pageSize = readCountParam(params.pagesize, 20)
  const suspenseKey = `${search || ""}:${page}:${pageSize}:${propertyId || ""}`

  return <div className="space-y-4"><div className="space-y-4"><div className="space-y-1"><h1 className="text-2xl font-semibold leading-none tracking-tight">Pages</h1><p className="text-sm text-muted-foreground">View and manage all the pages that have been crawled and indexed.</p></div><div className="flex items-center justify-between"><div className="relative flex-1 md:grow-0"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><SearchInput placeholder="Search pages..." /></div></div></div><Suspense key={suspenseKey} fallback={<PagesListSkeleton />}><PagesList search={search} page={page} pageSize={pageSize} propertyId={propertyId} /></Suspense></div>
}
