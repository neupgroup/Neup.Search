"use server"

import { redirect } from "next/navigation"

export async function search(formData: FormData) {
  const query = formData.get("query") as string
  if (query) {
    redirect(`/query?q=${encodeURIComponent(query)}`)
  } else {
    redirect('/')
  }
}
