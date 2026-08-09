/*
::neup.documentation::manage-properties-page

Manage-scoped property selector and property dashboard.

::end
*/

import { Suspense } from "react"
import { PropertiesExplorer } from "@/components/properties-explorer"
import { ManagePropertiesSkeleton } from "@/components/manage-properties-skeleton"
import Link from "next/link"
import { ArrowRight, Plus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getPaginatedPropertyOptions } from "@/services/neupbot"

export const dynamic = "force-dynamic"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readPageParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : 1
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1
}

async function ManagePropertiesContent({
  selectedPropertyId,
  search,
  page,
}: {
  selectedPropertyId?: string
  search?: string
  page: number
}) {
  const pagination = await getPaginatedPropertyOptions({
    search,
    page,
    pageSize: 10,
    selectedPropertyId,
  })

  return (
    <div className="space-y-4">
      <PropertiesExplorer
        properties={pagination.properties}
        selectedPropertyId={selectedPropertyId}
        dashboard={null}
        basePath="/manage/properties"
        cardsPath="/manage"
        title=""
        description=""
        search={search}
        showSearch
        searchPlaceholder="Search site"
        showDashboard={false}
        selectedCardOnly
        hideSelectedCard
        wrapSelectorInCard={false}
        showSelectField={false}
        leadingCard={
          <Link href="/manage/properties/add" className="block">
            <Card className="w-full rounded-t-lg rounded-b-none border-border/60 transition-colors hover:bg-muted/40">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
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
          </Link>
        }
        pagination={{
          page: pagination.page,
          totalPages: pagination.totalPages,
          totalCount: pagination.totalCount,
          pageSize: pagination.pageSize,
          basePath: "/manage/properties",
          search,
          selectedPropertyId,
        }}
      />
    </div>
  )
}

export default async function ManagePropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedPropertyId = readQueryParam(resolvedSearchParams.property)
  const search = readQueryParam(resolvedSearchParams.q)
  const page = readPageParam(resolvedSearchParams.page)
  const suspenseKey = `${search || ""}:${page}:${selectedPropertyId || ""}`

  return (
    <Suspense key={suspenseKey} fallback={<ManagePropertiesSkeleton />}>
      <ManagePropertiesContent
        selectedPropertyId={selectedPropertyId}
        search={search}
        page={page}
      />
    </Suspense>
  )
}
