"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { viewCrawlerDataAction, type LiveCrawlerDataState } from "../actions"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Fetching..." : "View Crawlers Data"}
    </Button>
  )
}

export function CrawlerDataPanel({ url }: { url: string }) {
  const initialState: LiveCrawlerDataState = {}
  const [state, action] = useActionState(viewCrawlerDataAction, initialState)

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold leading-none tracking-tight">Live Crawler Data</h2>
          <p className="text-sm text-muted-foreground">
            Fetch the live page using the crawler user-agent and inspect the returned source.
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
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Live Response</CardTitle>
                <CardDescription className="break-all">{state.data.url}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={state.data.status >= 400 ? "destructive" : "secondary"}>
                  {state.data.status} {state.data.statusText}
                </Badge>
                {state.data.contentType && (
                  <Badge variant="outline">{state.data.contentType}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
              <div>Fetched: {new Date(state.data.fetchedAt).toLocaleString()}</div>
              <div>{state.data.truncated ? "HTML truncated for display." : "Full response shown."}</div>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Response Headers</summary>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {state.data.headers.map((header) => (
                  <div key={header.key} className="break-all">
                    <span className="font-medium text-foreground">{header.key}:</span> {header.value}
                  </div>
                ))}
              </div>
            </details>

            <pre className="max-h-[640px] overflow-auto rounded-md border bg-muted p-4 text-xs leading-relaxed">
              <code>{state.data.html}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
