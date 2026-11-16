/*
::neup.documentation::managed-property-create-form

Shared manage form for creating a new crawled property.

::end
*/

"use client"

import { useState } from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { addSite } from "@/app/manage/sites/actions"
import { Alert, AlertDescription } from "@neup/components/ui/alert"
import { Button } from "@neup/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@neup/components/ui/card"
import { Input } from "@neup/components/ui/input"
import { Label } from "@neup/components/ui/label"

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : label}
    </Button>
  )
}

export function ManagedPropertyCreateForm({
  title,
  description,
  submitLabel,
  propertyId = "",
}: {
  title: string
  description: string
  submitLabel: string
  propertyId?: string
}) {
  const initialState: { errors: Record<string, string[]> } = { errors: {} }
  const [state, dispatch] = useActionState(addSite, initialState)
  const [pasteHint, setPasteHint] = useState("")

  // Remove a pasted web protocol and format its host and path for the suggestion.
  function getPastedUrlSuggestion(value: string) {
    const withoutProtocol = value.trim().replace(/^https?:\/\//i, "")
    const normalizedValue = withoutProtocol.split(/[?#]/, 1)[0].replace(/\/$/, "")
    const [host, ...pathSegments] = normalizedValue.split("/")

    if (!host) return ""
    const domainAndPath = [host, ...pathSegments].join("/")
    return pathSegments.length > 0
      ? `Trying to add ${host}? or ${domainAndPath}`
      : `Trying to add ${host}?`
  }

  // Show the suggestion only in response to a paste event.
  function handleUrlPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pastedValue = event.clipboardData.getData("text")
    setPasteHint(getPastedUrlSuggestion(pastedValue))
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="grid gap-4 md:grid-cols-[1fr_250px] lg:grid-cols-3 lg:gap-8">
          <div className="grid auto-rows-max items-start gap-4 lg:col-span-2 lg:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={dispatch} className="space-y-6">
                  <input type="hidden" name="property" value={propertyId} />
                  <div className="space-y-2">
                    <Label htmlFor="url">Domain</Label>
                    <Input
                      id="url"
                      name="url"
                      type="text"
                      placeholder="example.com"
                      onPaste={handleUrlPaste}
                      aria-invalid={Boolean(state.errors?.url?.length)}
                      aria-describedby={state.errors?.url?.length ? "url-error" : undefined}
                    />
                    {pasteHint ? (
                      <p className="text-sm text-muted-foreground" role="status">
                        {pasteHint}
                      </p>
                    ) : null}
                    {state.errors?.url ? (
                      <p id="url-error" className="text-sm font-medium text-destructive">
                        {state.errors.url[0]}
                      </p>
                    ) : null}
                  </div>
                  {state.errors?._server ? (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>{state.errors._server[0]}</AlertDescription>
                    </Alert>
                  ) : null}
                  <SubmitButton label={submitLabel} />
                </form>
              </CardContent>
            </Card>
          </div>
          <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  <div className="grid gap-3">
                    <p className="text-sm text-muted-foreground">
                      - Enter only the domain or IP address. Protocol is added automatically.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      - The crawler will start from the homepage and follow links to discover other pages.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      - Ensure the site does not block web crawlers in its `robots.txt` file.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
