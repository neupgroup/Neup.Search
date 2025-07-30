
import { notFound } from "next/navigation"
import { getPageById, getBacklinks, summarizePageAction } from "../actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"

export default async function PageDetailPage({ params }: { params: { pageId: string } }) {
  const page = await getPageById(params.pageId)
  
  if (!page) {
    notFound()
  }

  const backlinks = await getBacklinks(page.url)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl break-all">{page.title}</CardTitle>
              <CardDescription>
                <Link href={page.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                  {page.url}
                </Link>
              </CardDescription>
            </div>
            <form action={async () => {
                "use server"
                if (page.content) {
                    await summarizePageAction(page.id, page.content)
                }
            }}>
                <Button type="submit" variant="outline" disabled={!page.content}>
                    {page.summary ? "Update Summary" : "Generate Summary"}
                </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <h3 className="font-semibold text-lg mb-2">AI Generated Summary</h3>
          <p className="text-sm text-muted-foreground">
            {page.summary || "No summary has been generated for this page yet. Click the button above to create one."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backlinks</CardTitle>
          <CardDescription>
            A list of all pages that link to this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backlinks.length === 0 && (
                <TableRow>
                  <TableCell className="h-24 text-center">
                    No backlinks have been recorded for this page yet.
                  </TableCell>
                </TableRow>
              )}
              {backlinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">
                     <Link href={link.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
                        {link.sourceTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">{link.sourceUrl}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
