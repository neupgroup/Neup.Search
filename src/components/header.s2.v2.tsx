/*
::neup.documentation::header-s2-v2-component

Shared application header based on the manage panel top bar styling.

::end
*/

import Link from "next/link"
import { Package2 } from "lucide-react"

import { SearchBar } from "@/components/search-bar"
import { ThemeToggle } from "@/components/theme-toggle"

type HeaderS2V2Props = {
  initialQuery?: string
  showSearch?: boolean
}

export default function HeaderS2V2({
  initialQuery,
  showSearch = false,
}: HeaderS2V2Props) {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-white px-4 shadow-[0_18px_48px_hsl(var(--foreground)/0.122)] backdrop-blur supports-[backdrop-filter]:bg-white/95 dark:shadow-[0_18px_48px_hsl(0_0%_0%/0.317)]">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold" prefetch={false}>
          <Package2 className="h-6 w-6" />
          <span>NeupSearch</span>
        </Link>
        {showSearch ? (
          <div className="flex-1">
            <SearchBar initialQuery={initialQuery} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
