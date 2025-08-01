
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
