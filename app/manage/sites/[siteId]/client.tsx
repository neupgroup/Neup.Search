
"use client"

import { useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { crawlSite, cancelCrawl, summarizeSiteAction, deletePagesForSite, crawlJavascriptSite, resumePendingCrawl, getSiteCrawlStatus, deleteSite } from "@/app/manage/sites/actions"
import { Button } from "@neup/components/ui/button"
import { Badge } from "@neup/components/ui/badge"
import { Braces, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@neup/components/ui/alert-dialog"

function SubmitButton({ children, variant = "default", ...props }: { children: React.ReactNode, variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined, [key: string]: any }) {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending} variant={variant} {...props}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </Button>
    )
}

type LiveCrawlStatusState = NonNullable<Awaited<ReturnType<typeof getSiteCrawlStatus>>>

function getStatusVariant(status: string) {
    if (status === "Active") return "default"
    if (status === "Crawling") return "default"
    if (status === "Pending") return "outline"
    if (status === "Paused") return "secondary"
    return "destructive"
}

export function LiveCrawlStatus({ siteId, initialStatus }: { siteId: string, initialStatus: LiveCrawlStatusState }) {
    const [status, setStatus] = useState(initialStatus)

    useEffect(() => {
        if (status.status !== "Crawling") return

        const interval = window.setInterval(() => {
            getSiteCrawlStatus(siteId).then((nextStatus) => {
                if (nextStatus) setStatus(nextStatus)
            })
        }, 3000)

        return () => window.clearInterval(interval)
    }, [siteId, status.status])

    return (
        <div>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-6">
                <div>
                    <p className="font-semibold">Status</p>
                    <Badge variant={getStatusVariant(status.status)}>
                        {status.status}
                    </Badge>
                </div>
                <div>
                    <p className="font-semibold">Last Crawled</p>
                    <p>{status.lastCrawled}</p>
                </div>
                <div>
                    <p className="font-semibold">Found Internal</p>
                    <p>{status.internalResourcesFound.toLocaleString()}</p>
                </div>
                <div>
                    <p className="font-semibold">Found External</p>
                    <p>{status.externalResourcesFound.toLocaleString()}</p>
                </div>
                <div>
                    <p className="font-semibold">Crawled Internal</p>
                    <p>{status.pagesCrawled.toLocaleString()}</p>
                </div>
                <div>
                    <p className="font-semibold">Date Added</p>
                    <p>{new Date(status.createdAt).toLocaleDateString()}</p>
                </div>
            </div>
            {(status.status === "Crawling" || (status.currentlyCrawling && status.currentlyCrawling !== "Crawl complete.")) && (
                <div className="mt-4 text-sm">
                    <p className="font-semibold">Current Activity</p>
                    <p className="text-muted-foreground break-all">{status.currentlyCrawling}</p>
                </div>
            )}
            {status.status === "Crawling" && status.currentCrawlUrl && (
                <div className="mt-4 text-sm">
                    <p className="font-semibold">Crawling Page</p>
                    <p className="text-muted-foreground break-all">{status.currentCrawlUrl}</p>
                </div>
            )}
            {status.status === "Error" && status.currentlyCrawling && (
                <div className="mt-4 text-sm text-destructive">
                    <p className="font-semibold">Error Details</p>
                    <p>{status.currentlyCrawling}</p>
                </div>
            )}
        </div>
    )
}

export function RecrawlButton({ siteId, siteUrl, status }: { siteId: string, siteUrl: string, status: string }) {
    return (
        <form action={crawlSite}>
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="siteUrl" value={siteUrl} />
            <SubmitButton disabled={status === "Crawling"}>
                {status === "Crawling" ? "Crawling..." : "Force Scrape"}
            </SubmitButton>
        </form>
    )
}

export function JavascriptCrawlButton({ siteId, siteUrl, status }: { siteId: string, siteUrl: string, status: string }) {
    return (
        <form action={crawlJavascriptSite}>
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="siteUrl" value={siteUrl} />
            <SubmitButton variant="outline" disabled={status === "Crawling"}>
                <Braces className="mr-2 h-4 w-4" />
                {status === "Crawling" ? "Crawling..." : "JS Crawl"}
            </SubmitButton>
        </form>
    )
}

export function ResumeCrawlButton({ siteId, status }: { siteId: string, status: string }) {
    return (
        <form action={resumePendingCrawl}>
            <input type="hidden" name="siteId" value={siteId} />
            <SubmitButton variant="outline" disabled={status === "Crawling"}>
                {status === "Crawling" ? "Crawling..." : "Resume Crawling"}
            </SubmitButton>
        </form>
    )
}

export function CancelCrawlButton({ siteId }: { siteId: string }) {
    return (
        <form action={cancelCrawl}>
            <input type="hidden" name="siteId" value={siteId} />
            <SubmitButton variant="destructive">
                Cancel Crawl
            </SubmitButton>
        </form>
    )
}

export function UpdateSummaryButton({ siteId, siteUrl }: { siteId: string, siteUrl: string }) {
    return (
        <form action={summarizeSiteAction}>
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="siteUrl" value={siteUrl} />
            <SubmitButton variant="outline">
                Update Summary
            </SubmitButton>
        </form>
    )
}

export function DeletePagesButton({ siteId, siteName }: { siteId: string, siteName: string }) {
    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" className="bg-red-700 hover:bg-red-800">Delete All Pages</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deletePagesForSite}>
                    <input type="hidden" name="siteId" value={siteId} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete all indexed pages for <strong>{siteName}</strong> from your database.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <SubmitButton variant="destructive">
                                Continue
                            </SubmitButton>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function DeleteSiteButton({ siteId, siteName }: { siteId: string, siteName: string }) {
    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete Site</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deleteSite}>
                    <input type="hidden" name="siteId" value={siteId} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this site?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete <strong>{siteName}</strong>, its pages, sitemaps, and links from your database.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <SubmitButton variant="destructive">
                                Delete Site
                            </SubmitButton>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    )
}
