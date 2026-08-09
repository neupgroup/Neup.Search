import { redirect } from "next/navigation"

function readQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function PropertyAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const propertyId = readQueryParam(resolvedSearchParams.property)

  if (propertyId) {
    redirect(`/manage/sites/${id}?property=${encodeURIComponent(propertyId)}`)
  }

  redirect(`/manage/sites/${id}`)
}
