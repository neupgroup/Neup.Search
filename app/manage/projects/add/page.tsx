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
      title="Add Property"
      description="Enter the domain name you want to crawl and index."
      submitLabel="Add and Crawl"
      propertyId={propertyId}
    />
  )
}
