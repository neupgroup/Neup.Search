
"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { addSite } from "@/app/manage/sites/actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding Site..." : "Add Site"}
    </Button>
  )
}

export default function AddNewSitePage() {
  const initialState: { errors: Record<string, string[]> } = { errors: {} };
  const [state, dispatch] = useActionState(addSite, initialState);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="grid gap-4 md:grid-cols-[1fr_250px] lg:grid-cols-3 lg:gap-8">
          <div className="grid auto-rows-max items-start gap-4 lg:col-span-2 lg:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Add New Site</CardTitle>
                <CardDescription>
                  Enter the details of the site you want to crawl and index.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={dispatch} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="url">Site URL</Label>
                    <Input
                      id="url"
                      name="url"
                      type="url"
                      placeholder="https://example.com"
                      aria-describedby="url-error"
                    />
                     {state.errors?.url && (
                      <p id="url-error" className="text-sm font-medium text-destructive">
                        {state.errors.url[0]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="A brief description of the website."
                      aria-describedby="description-error"
                    />
                    {state.errors?.description && (
                      <p id="description-error" className="text-sm font-medium text-destructive">
                        {state.errors.description[0]}
                      </p>
                    )}
                  </div>
                   {state.errors?._server && (
                    <Alert variant="destructive">
                      <AlertDescription>{state.errors._server[0]}</AlertDescription>
                    </Alert>
                  )}
                  <SubmitButton />
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
                                - Provide the full URL of the site, including `http://` or `https://`.
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
