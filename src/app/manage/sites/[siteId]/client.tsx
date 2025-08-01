
"use client"

import { useFormStatus } from "react-dom"
import { crawlSite, cancelCrawl, summarizeSiteAction, deletePagesForSite } from "@/app/manage/sites/actions"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
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
} from "@/components/ui/alert-dialog"

function SubmitButton({ children, variant = "default", ...props }: { children: React.ReactNode, variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined, [key: string]: any }) {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending} variant={variant} {...props}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </Button>
    )
}

export function RecrawlButton({ siteId, siteUrl, status }: { siteId: string, siteUrl: string, status: string }) {
    const crawlSiteWithParams = crawlSite.bind(null, siteId, siteUrl)
    return (
        <form action={crawlSiteWithParams}>
            <SubmitButton disabled={status === "Crawling"}>
                {status === "Crawling" ? "Crawling..." : "Force Scrape"}
            </SubmitButton>
        </form>
    )
}

export function CancelCrawlButton({ siteId }: { siteId: string }) {
    const cancelCrawlWithId = cancelCrawl.bind(null, siteId)
    return (
        <form action={cancelCrawlWithId}>
            <SubmitButton variant="destructive">
                Cancel Crawl
            </SubmitButton>
        </form>
    )
}

export function UpdateSummaryButton({ siteId, siteUrl }: { siteId: string, siteUrl: string }) {
    const summarizeSiteActionWithParams = summarizeSiteAction.bind(null, siteId, siteUrl)
    return (
        <form action={summarizeSiteActionWithParams}>
            <SubmitButton variant="outline">
                Update Summary
            </SubmitButton>
        </form>
    )
}

export function DeletePagesButton({ siteId, siteName }: { siteId: string, siteName: string }) {
    const deletePagesForSiteWithId = deletePagesForSite.bind(null, siteId)
    return (
         <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" className="bg-red-700 hover:bg-red-800">Delete All Pages</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all indexed pages for <strong>{siteName}</strong> from your database.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <form action={deletePagesForSiteWithId}>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <SubmitButton variant="destructive">
                                Continue
                            </SubmitButton>
                        </AlertDialogAction>
                    </form>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
