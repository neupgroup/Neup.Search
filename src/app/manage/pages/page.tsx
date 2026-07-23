

import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

function PageContent({search, startAfter}: {search?: string, startAfter?: string}) {
    return (
        <Suspense fallback={<div>Loading pages...</div>}>
            <PagesList search={search} startAfter={startAfter} />
        </Suspense>
    )
}

async function PagesList({search, startAfter}: {search?:string, startAfter?: string}) {
    const { pages, lastVisibleId } = await getPages(search, startAfter);

    const prevLink = `/manage/pages${search ? `?q=${search}` : ''}`;
    let nextLink = `/manage/pages?startAfter=${lastVisibleId}`;
    if (search) {
        nextLink += `&q=${search}`;
    }

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
                 <div className="flex justify-end gap-2 w-full">
                    <Link href={prevLink}>
                        <Button variant="outline" disabled={!startAfter}>Previous</Button>
                    </Link>
                     <Link href={nextLink}>
                        <Button variant="outline" disabled={!lastVisibleId || pages.length < 20}>Next</Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}


export default async function ManagePagesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const resolvedSearchParams = await searchParams;
  const startAfter = resolvedSearchParams.startAfter as string | undefined;
  const search = resolvedSearchParams.q as string | undefined;
  return (
    <PageContent search={search} startAfter={startAfter} />
  )
}
