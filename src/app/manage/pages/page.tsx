

import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, Search } from "lucide-react"
import { getPages, type Page } from "./actions"
import Link from "next/link"
import { SearchInput } from "@/components/search-input"

function getStatusDotClass(page: Page) {
    if (page.statusCode && page.statusCode >= 400) return "bg-red-500"
    if (page.status === "Error") return "bg-red-500"
    if (page.status === "Redirect" || page.status === "Skipped" || (page.statusCode && page.statusCode >= 300)) {
        return "bg-orange-500"
    }
    if (page.status === "Indexed") return "bg-green-500"
    if (page.status === "Pending" && page.domainStatus === "Crawling") return "bg-slate-400"
    return "bg-blue-500"
}

function buildPageLink(params: { search?: string; page: number; pageSize: number }) {
    const query = new URLSearchParams()
    query.set("page", String(params.page))
    query.set("pagesize", String(params.pageSize))

    if (params.search) {
        query.set("q", params.search)
    }

    return `/manage/pages?${query.toString()}`
}

function buildPageDetailLink(pageId: string, propertyId?: string) {
    if (!propertyId) return `/manage/pages/${pageId}`

    const query = new URLSearchParams()
    query.set("property", propertyId)
    return `/manage/pages/${pageId}?${query.toString()}`
}

function readCountParam(value: string | string[] | undefined, fallback: number) {
    const rawValue = Array.isArray(value) ? value[0] : value
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function PagesListSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-5 w-full max-w-lg" />
                                <Skeleton className="h-4 w-full max-w-2xl" />
                            </div>
                            <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function PageContent({search, page, pageSize, propertyId}: {search?: string, page: number, pageSize: number, propertyId?: string}) {
    const suspenseKey = `${search || ""}:${page}:${pageSize}:${propertyId || ""}`

    return (
        <div className="space-y-4">
            <div className="space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold leading-none tracking-tight">Indexed Pages</h1>
                    <p className="text-sm text-muted-foreground">
                        View and manage all the pages that have been crawled and indexed.
                    </p>
                </div>
                <div className="flex items-center justify-between">
                    <div className="relative flex-1 md:grow-0">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <SearchInput
                            placeholder="Search pages..."
                        />
                    </div>
                </div>
            </div>
            <Suspense key={suspenseKey} fallback={<PagesListSkeleton />}>
                <PagesList search={search} page={page} pageSize={pageSize} propertyId={propertyId} />
            </Suspense>
        </div>
    )
}

async function PagesList({search, page, pageSize, propertyId}: {search?: string, page: number, pageSize: number, propertyId?: string}) {
    const pagination = await getPages(search, page, pageSize);
    const { pages, totalCount, totalPages } = pagination;
    const previousPage = Math.max(1, pagination.page - 1);
    const nextPage = Math.min(totalPages, pagination.page + 1);

    const prevLink = buildPageLink({ search, page: previousPage, pageSize: pagination.pageSize });
    const nextLink = buildPageLink({ search, page: nextPage, pageSize: pagination.pageSize });

    return (
        <div className="space-y-4">
            <div className="space-y-0">
                {pages.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="p-6 text-center text-sm text-muted-foreground">
                            No pages found.
                        </CardContent>
                    </Card>
                )}
                {pages.map((page, index) => {
                    const isFirst = index === 0
                    const isLast = index === pages.length - 1
                    const cornerClass = isFirst
                        ? "rounded-t-lg rounded-b-none"
                        : isLast
                            ? "rounded-b-lg rounded-t-none"
                            : "rounded-none"

                    return (
                    <Link key={page.id} href={buildPageDetailLink(page.id, propertyId)} className="block">
                    <Card className={`border-border/60 transition-colors hover:border-primary hover:bg-muted/40 ${cornerClass}`}>
                        <CardContent className="p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getStatusDotClass(page)}`} />
                                        <div className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold leading-tight">
                                        {page.title}
                                        </div>
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted-foreground">
                                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{page.url}</span>
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    </Link>
                )})}
            </div>
            <div>
                 <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {pagination.page} of {totalPages} | {totalCount.toLocaleString()} pages
                    </div>
                    <div className="flex justify-end gap-2">
                    <Link href={prevLink}>
                        <Button variant="outline" disabled={pagination.page <= 1}>Previous</Button>
                    </Link>
                     <Link href={nextLink}>
                        <Button variant="outline" disabled={pagination.page >= totalPages}>Next</Button>
                    </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}


export default async function ManagePagesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const resolvedSearchParams = await searchParams;
  const search = resolvedSearchParams.q as string | undefined;
  const propertyId = resolvedSearchParams.property as string | undefined;
  const page = readCountParam(resolvedSearchParams.page, 1);
  const pageSize = readCountParam(resolvedSearchParams.pagesize, 20);

  return (
    <PageContent search={search} page={page} pageSize={pageSize} propertyId={propertyId} />
  )
}
