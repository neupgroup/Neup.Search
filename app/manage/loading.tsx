import { Card, CardContent, CardHeader } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"

// Keep the manage shell responsive while a destination route begins rendering.
export default function ManageLoading() {
  return (
    <div className="space-y-6" aria-label="Loading manage page" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-border/60">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-36 max-w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/60">
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
