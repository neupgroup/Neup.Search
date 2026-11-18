"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@neup/components/ui/button"
import { viewCrawlerDataAction, type LiveCrawlerDataState } from "../actions"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Rendering..." : "View Rendered HTML"}
    </Button>
  )
}
export function CrawlerDataPanel({ url }: { url: string }) {
  const initialState: LiveCrawlerDataState = {}
  const [state, action] = useActionState(viewCrawlerDataAction, initialState)

  return (
    <section className="space-y-3">
      <div className="flex flex-col items-start gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold leading-none tracking-tight">Live Crawler Data</h2>
          <p className="text-sm text-muted-foreground">
            Preview the live page after rendering it with JavaScript enabled.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="url" value={url} />
          <SubmitButton />
        </form>
      </div>

      {state.error && (
        <div className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.data && (
        <iframe
          title="JavaScript-rendered page"
          srcDoc={state.data.html}
          sandbox=""
          className="h-[720px] w-full rounded-md border bg-white"
        />
      )}
    </section>
  )
}
