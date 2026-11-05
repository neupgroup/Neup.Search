/*
::neup.documentation::manage-projects-add-page

Manage route for creating a new crawled property.

::end
*/

import { ManagedPropertyCreateForm } from "@/components/managed-property-create-form"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function ManageProjectsAddPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const propertyId = readQueryParam(resolvedSearchParams.property) || ""

  return (
    <ManagedPropertyCreateForm
      title="Add a Project"
      description="Add a website to crawl, index, and monitor."
      submitLabel="Add and Crawl Project"
      propertyId={propertyId}
    />
  )
}
