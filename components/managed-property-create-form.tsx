/*
::neup.documentation::managed-property-create-form

Shared manage form for creating a new crawled property.

::end
*/

"use client"

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
                      aria-describedby="url-error"
                    />
                    {state.errors?.url ? (
                      <p id="url-error" className="text-sm font-medium text-destructive">
                        {state.errors.url[0]}
                      </p>
                    ) : null}
                  </div>
                  {state.errors?._server ? (
                    <Alert variant="destructive">
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
