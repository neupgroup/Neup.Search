

import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, Search } from "lucide-react"
import { getPages } from "./actions"
import Link from "next/link"
import { SearchInput } from "@/components/search-input"

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
        <Card>
            <CardHeader>
                <CardTitle>Indexed Pages</CardTitle>
                <CardDescription>
                View and manage all the pages that have been crawled and indexed.
                </CardDescription>
                <div className="flex items-center justify-between pt-4">
                    <div className="relative flex-1 md:grow-0">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <SearchInput 
                            placeholder="Search pages..."
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[30%]">Page Title</TableHead>
                    <TableHead className="w-[30%]">URL</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Indexed</TableHead>
                    <TableHead>
                        <span className="sr-only">Actions</span>
                    </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pages.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No pages found.
                            </TableCell>
                        </TableRow>
                    )}
                    {pages.map((page) => (
                    <TableRow key={page.id}>
                        <TableCell className="font-medium">
                            <Link href={`/manage/pages/${page.id}`} className="font-bold hover:underline">{page.title}</Link>
                            <div className="text-xs text-muted-foreground line-clamp-2">{page.description}</div>
                        </TableCell>
                        <TableCell className="font-medium break-all">{page.url}</TableCell>
                        <TableCell>{page.siteUrl}</TableCell>
                        <TableCell>
                        <Badge variant={
                            page.status === 'Indexed' ? 'default' 
                            : page.status === 'Pending' ? 'outline'
                            : 'destructive'
                        }>
                            {page.status}
                        </Badge>
                        </TableCell>
                        <TableCell>{page.lastIndexed}</TableCell>
                        <TableCell>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem>Re-index</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/manage/pages/${page.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">Delete from Index</DropdownMenuItem>
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
                    <Link href={prevLink}>
                        <Button variant="outline" disabled={!startAfter}>Previous</Button>
                    </Link>
                     <Link href={nextLink}>
                        <Button variant="outline" disabled={!lastVisibleId || pages.length < 20}>Next</Button>
                    </Link>
                </div>
            </CardFooter>
        </Card>
    )
}


export default async function ManagePagesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const startAfter = searchParams.startAfter as string | undefined;
  const search = searchParams.q as string | undefined;
  return (
    <PageContent search={search} startAfter={startAfter} />
  )
}
