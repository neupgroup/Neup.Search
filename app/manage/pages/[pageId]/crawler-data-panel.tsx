"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@neup/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"
import { Badge } from "@neup/components/ui/badge"
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
              <div>{state.data.truncated ? "HTML snapshots truncated for display." : "Full HTML snapshots shown."}</div>
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

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Raw Crawled HTML</summary>
              <HtmlSnapshot html={state.data.html} emptyMessage="No HTML response was returned." />
            </details>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">JavaScript Crawled HTML</summary>
              <HtmlSnapshot html={state.data.javascriptHtml} emptyMessage="No JavaScript rendered HTML was returned." />
            </details>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Rendered Content</h3>
              {state.data.renderedContent ? (
                <iframe
                  title="JavaScript rendered page content"
                  srcDoc={state.data.javascriptHtml}
                  sandbox=""
                  className="h-[640px] w-full rounded-md border bg-white"
                />
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No rendered HTML is available to preview.
                </p>
              )}
            </section>

            <ResourceList title="Images, Media" emptyMessage="No images or media found." items={state.data.imagesMedia.map((item) => ({ ...item, label: item.alt || item.type }))} previews />
            <ResourceList title="Binaries" emptyMessage="No binary links found." items={state.data.binaries} />
            <section className="grid gap-4 lg:grid-cols-2">
              <ResourceList title="Internal Links" emptyMessage="No internal links found." items={state.data.internalLinks.map((item) => ({ url: item.url, label: item.text || item.url }))} />
              <ResourceList title="External Links" emptyMessage="No external links found." items={state.data.externalLinks.map((item) => ({ url: item.url, label: item.text || item.url }))} />
            </section>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

// Display an HTML snapshot as readable source with resolved absolute URLs.
function HtmlSnapshot({ html, emptyMessage }: { html: string; emptyMessage: string }) {
  if (!html) return <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
  return (
    <pre className="mt-3 max-h-[640px] overflow-auto rounded-md border bg-muted p-4 text-xs leading-relaxed">
      <code>{html}</code>
    </pre>
  )
}

// Render discovered resources and navigation URLs as absolute links.
function ResourceList({
  title,
  emptyMessage,
  items,
  previews = false,
}: {
  title: string
  emptyMessage: string
  items: Array<{ url: string; label: string }>
  previews?: boolean
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title} <span className="text-muted-foreground">({items.length})</span></h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="max-h-[480px] space-y-2 overflow-auto rounded-md border p-3">
          {items.map((item) => (
            <li key={item.url} className="flex items-start gap-3 text-sm">
              {previews && <img src={item.url} alt="" className="h-12 w-12 shrink-0 rounded border object-cover" loading="lazy" />}
              <div className="min-w-0">
                <div className="font-medium">{item.label}</div>
                <a href={item.url} target="_blank" rel="noreferrer" className="block break-all text-xs text-muted-foreground hover:text-primary">
                  {item.url}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
