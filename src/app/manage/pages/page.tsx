
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, Search } from "lucide-react"
import { getPages, type Page } from "./actions"
import Link from "next/link"

function PageContent({startAfter}: {startAfter?: string}) {
    return (
        <Suspense fallback={<div>Loading pages...</div>}>
            <PagesList startAfter={startAfter} />
        </Suspense>
    )
}

async function PagesList({startAfter}: {startAfter?: string}) {
    const { pages, lastVisibleId } = await getPages(startAfter);

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
                        <Input
                            type="search"
                            placeholder="Search pages..."
                            className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Page URL</TableHead>
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
                            <TableCell colSpan={5} className="h-24 text-center">
                                No pages found. Start by adding a site to be crawled.
                            </TableCell>
                        </TableRow>
                    )}
                    {pages.map((page) => (
                    <TableRow key={page.id}>
                        <TableCell className="font-medium">{page.url}</TableCell>
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
                            <DropdownMenuItem>View Details</DropdownMenuItem>
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
                    <Link href="/manage/pages">
                        <Button variant="outline" disabled={!startAfter}>Previous</Button>
                    </Link>
                     <Link href={`/manage/pages?startAfter=${lastVisibleId}`}>
                        <Button variant="outline" disabled={!lastVisibleId || pages.length < 20}>Next</Button>
                    </Link>
                </div>
            </CardFooter>
        </Card>
    )
}


export default async function ManagePagesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const startAfter = searchParams.startAfter as string | undefined;
  return (
    <PageContent startAfter={startAfter} />
  )
}
