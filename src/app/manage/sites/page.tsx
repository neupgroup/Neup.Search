

import { getSites, type Site } from "./actions"
import ManageSitesClientPage from "./client-page"
import { Suspense } from "react"

export const dynamic = 'force-dynamic'

function PageContent({search, startAfter}: {search?: string, startAfter?: string}) {
  return (
    <Suspense fallback={<div>Loading sites...</div>}>
      <SitesList search={search} startAfter={startAfter} />
    </Suspense>
  )
}

async function SitesList({search, startAfter}: {search?: string, startAfter?: string}) {
  const { sites, lastVisibleId } = await getSites(search, startAfter);
  return <ManageSitesClientPage sites={sites} lastVisibleId={lastVisibleId} />
}


export default async function ManageSitesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const startAfter = searchParams.startAfter as string | undefined;
  const search = searchParams.q as string | undefined;

  return (
    <PageContent search={search} startAfter={startAfter} />
  )
}
