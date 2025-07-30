

import { getSites, type Site } from "./actions"
import ManageSitesClientPage from "./client-page"

export const dynamic = 'force-dynamic'

export default async function ManageSitesPage() {
  const crawledSites: Site[] = await getSites();

  return (
    <ManageSitesClientPage sites={crawledSites} />
  )
}
