/*
::neup.documentation::root-not-found-page

Application-wide 404 page for unknown routes.

::end
*/

import Link from "next/link"
import { Compass, Home, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.12),_transparent_28%)]" />
      <Card className="relative w-full max-w-2xl border-border/60 bg-card/95 shadow-xl backdrop-blur">
        <CardContent className="space-y-8 p-8 sm:p-10">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Compass className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Error 404</p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Page not found</h1>
              <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
                The page you requested does not exist or may have been moved.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/" className="block">
              <Button className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Go to Home
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                <Search className="mr-2 h-4 w-4" />
                Open Search
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
