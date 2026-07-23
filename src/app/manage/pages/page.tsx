

import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, Search } from "lucide-react"
import { getPages, type Page } from "./actions"
import Link from "next/link"
import { SearchInput } from "@/components/search-input"

function getStatusLabel(page: Page) {
    return page.statusCode && page.statusCode >= 400 ? String(page.statusCode) : page.status
}

function getStatusVariant(page: Page) {
    if (page.statusCode && page.statusCode >= 400) return "destructive"
    if (page.status === "Error") return "destructive"
    if (page.status === "Indexed") return "default"
    if (page.status === "Pending") return "outline"
    return "secondary"
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
                            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function PageContent({search, page, pageSize}: {search?: string, page: number, pageSize: number}) {
    const suspenseKey = `${search || ""}:${page}:${pageSize}`

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
                <PagesList search={search} page={page} pageSize={pageSize} />
            </Suspense>
        </div>
    )
}

async function PagesList({search, page, pageSize}: {search?: string, page: number, pageSize: number}) {
    const pagination = await getPages(search, page, pageSize);
    const { pages, totalCount, totalPages } = pagination;
    const previousPage = Math.max(1, pagination.page - 1);
    const nextPage = Math.min(totalPages, pagination.page + 1);

    const prevLink = buildPageLink({ search, page: previousPage, pageSize: pagination.pageSize });
    const nextLink = buildPageLink({ search, page: nextPage, pageSize: pagination.pageSize });

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                {pages.length === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="p-6 text-center text-sm text-muted-foreground">
                            No pages found.
                        </CardContent>
                    </Card>
                )}
                {pages.map((page) => (
                    <Card key={page.id} className="transition-colors hover:bg-muted/50">
                        <CardContent className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 space-y-2">
                                    <Link
                                        href={`/manage/pages/${page.id}`}
                                        className="block truncate text-base font-semibold leading-tight hover:underline"
                                    >
                                        {page.title}
                                    </Link>
                                    <a
                                        href={page.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex min-w-0 items-center gap-2 break-all text-sm text-muted-foreground hover:text-primary"
                                    >
                                        <span>{page.url}</span>
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    </a>
                                </div>
                                <Badge variant={getStatusVariant(page)} className="w-fit shrink-0">
                                    {getStatusLabel(page)}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                ))}
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
  const page = readCountParam(resolvedSearchParams.page, 1);
  const pageSize = readCountParam(resolvedSearchParams.pagesize, 20);

  return (
    <PageContent search={search} page={page} pageSize={pageSize} />
  )
}
