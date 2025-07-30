

import { getSites, type Site } from "./actions"
import ManageSitesClientPage from "./client-page"
import { Suspense } from "react"

export const dynamic = 'force-dynamic'

function PageContent({startAfter}: {startAfter?: string}) {
  return (
    <Suspense fallback={<div>Loading sites...</div>}>
      <SitesList startAfter={startAfter} />
    </Suspense>
  )
}

async function SitesList({startAfter}: {startAfter?: string}) {
  const { sites, lastVisibleId } = await getSites(startAfter);
  return <ManageSitesClientPage sites={sites} lastVisibleId={lastVisibleId} />
}


export default async function ManageSitesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const startAfter = searchParams.startAfter as string | undefined;

  return (
    <PageContent startAfter={startAfter} />
  )
}
