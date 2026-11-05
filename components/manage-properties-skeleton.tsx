/*
::neup.documentation::manage-properties-skeleton

Reusable loading skeleton for the manage properties explorer.

::end
*/

import { ArrowRight, Plus, Search } from "lucide-react"

import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"

export function ManagePropertiesSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Property Explorer</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Choose a domain and inspect its pages, indexed pages, links, crawl errors, and content from one place.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        <div className="space-y-0">
          <Card className="w-full rounded-t-lg rounded-b-none border-border/60">
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="font-semibold">Add your Property</div>
                    <div className="text-sm text-muted-foreground">
                      Add your property to see how people see!
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          {Array.from({ length: 6 }).map((_, index) => {
            const isLast = index === 5
            const cornerClass = isLast ? "rounded-b-lg rounded-t-none" : "rounded-none"

            return (
              <Card key={index} className={`w-full border-border/60 ${cornerClass}`}>
                <CardContent className="p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-64 max-w-full" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
