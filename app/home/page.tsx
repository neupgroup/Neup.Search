import type { Metadata } from "next"

import HeaderS2V2 from "@/components/header.s2.v2"
import { SearchBar } from "@/components/search-bar"

export const metadata: Metadata = {
  title: "Home | Neup.Search",
  description: "Search the web with Neup.Search.",
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderS2V2 />
      <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="mb-8 text-4xl font-semibold tracking-tight sm:text-5xl">Search with Neup.Search</h1>
        <div className="w-full max-w-3xl">
          <SearchBar />
        </div>
      </main>
    </div>
  )
}
