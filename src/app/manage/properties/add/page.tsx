/*
::neup.documentation::manage-properties-add-page

Manage route for creating a new crawled property.

::end
*/

import { ManagedPropertyCreateForm } from "@/components/managed-property-create-form"

export default function ManagePropertiesAddPage() {
  return (
    <ManagedPropertyCreateForm
      title="Add Property"
      description="Enter the domain name you want to crawl and index."
      submitLabel="Add and Crawl"
    />
  )
}
