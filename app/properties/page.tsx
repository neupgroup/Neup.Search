/*
::neup.documentation::properties-page

Property-scoped dashboard for browsing pages, links, crawl errors, indexed pages, and content samples by domain.

::end
*/

import { notFound } from "next/navigation"

import HeaderS2V2 from "@/components/header.s2.v2"
import { PropertiesExplorer } from "@/components/properties-explorer"
import { getPropertyDashboard, getPropertyOptions } from "../../../services/neupbot"

export const dynamic = "force-dynamic"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedPropertyId = readQueryParam(resolvedSearchParams.property)
  const search = readQueryParam(resolvedSearchParams.q)
  const properties = await getPropertyOptions(search)
  const dashboard = selectedPropertyId ? await getPropertyDashboard(selectedPropertyId) : null

  if (selectedPropertyId && !dashboard) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      <HeaderS2V2 />
      <main className="px-4 py-8 lg:px-6 lg:py-10">
        <div className="mx-auto max-w-[1440px] space-y-8">
          <PropertiesExplorer
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            dashboard={dashboard}
            basePath="/properties"
            search={search}
          />
        </div>
      </main>
    </div>
  )
}
