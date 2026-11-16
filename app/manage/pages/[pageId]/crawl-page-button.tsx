"use client"

import { useFormStatus } from "react-dom"
import { Button } from "@neup/components/ui/button"

// Show submission progress while the page crawl server action is running.
export function CrawlPageButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="default" disabled={pending}>
      {pending ? "Crawling..." : "Crawl Page"}
    </Button>
  )
}
