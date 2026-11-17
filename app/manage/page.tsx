import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@neup/components/ui/button"
import { PropertiesExplorer } from "@/components/properties-explorer"
import { getPropertyDashboard } from "@/services/projects/view"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// Show only the selected project's information on its manage dashboard.
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedSearchParams = await searchParams
  const selectedPropertyId = readQueryParam(resolvedSearchParams.property)

  if (!selectedPropertyId) redirect("/manage/projects")

  const dashboard = await getPropertyDashboard(selectedPropertyId)

  if (!dashboard) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">The selected project could not be found.</p>
        <Button asChild variant="outline">
          <Link href="/manage/projects">Choose a project</Link>
        </Button>
      </div>
    )
  }

  return (
    <PropertiesExplorer
      properties={[dashboard.property]}
      selectedPropertyId={selectedPropertyId}
      dashboard={dashboard}
      basePath="/manage/projects"
      cardsPath="/manage"
      title=""
      description=""
      heading=""
      headingDescription=""
      showDashboard
      showSearch={false}
      selectedCardOnly
      hideSelectedCard
      wrapSelectorInCard={false}
      showSelectField={false}
    />
  )
}
