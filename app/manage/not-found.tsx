/*
::neup.documentation::manage-not-found-page

Manage-scoped 404 page for missing management routes.

::end
*/

import Link from "next/link"
import { ArrowLeft, Globe, ShieldAlert } from "lucide-react"

import { Button } from "@neup/components/ui/button"
import { Card, CardContent } from "@neup/components/ui/card"

export default function ManageNotFound() {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden rounded-3xl bg-background px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.16),_transparent_35%),radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.12),_transparent_30%)]" />
      <Card className="relative w-full max-w-2xl border-border/60 bg-card/95 shadow-lg backdrop-blur">
        <CardContent className="space-y-8 p-8 sm:p-10">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Manage 404</p>
              <h1 className="text-4xl font-semibold tracking-tight">Route not found</h1>
              <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
                This manage page does not exist. It may have been removed or renamed.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/manage/properties" className="block">
              <Button className="w-full">
                <Globe className="mr-2 h-4 w-4" />
                Go to Properties
              </Button>
            </Link>
            <Link href="/manage" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
