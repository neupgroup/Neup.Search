/*
::neup.documentation::manage-properties-page

Manage-scoped property selector and property dashboard.

::end
*/

import { PropertiesExplorer } from "@/components/properties-explorer"
import Link from "next/link"
import { PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPaginatedPropertyOptions } from "../../../../services/neupbot"

export const dynamic = "force-dynamic"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readPageParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : 1
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1
}

export default async function ManagePropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedPropertyId = readQueryParam(resolvedSearchParams.property)
  const search = readQueryParam(resolvedSearchParams.q)
  const pagination = await getPaginatedPropertyOptions({
    search,
    page: readPageParam(resolvedSearchParams.page),
    pageSize: 10,
    selectedPropertyId,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/manage/properties/add">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Property
          </Button>
        </Link>
      </div>
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
        showDashboard={false}
        selectedCardOnly
        wrapSelectorInCard={false}
        showSelectField={false}
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
