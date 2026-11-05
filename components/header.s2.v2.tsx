/*
::neup.documentation::header-s2-v2-component

Shared application header based on the manage panel top bar styling.

::end
*/

import { SearchBar } from "@/components/search-bar"
import { NeupSearchBrand } from "@/components/neup-search-brand"
import { ThemeToggle } from "@/components/theme-toggle"

type HeaderS2V2Props = {
  initialQuery?: string
  showSearch?: boolean
  showThemeToggle?: boolean
}

export default function HeaderS2V2({
  initialQuery,
  showSearch = false,
  showThemeToggle = true,
}: HeaderS2V2Props) {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-white px-4 shadow-[0_12px_28px_hsl(var(--foreground)/0.16)] backdrop-blur supports-[backdrop-filter]:bg-white/95 dark:shadow-[0_12px_28px_hsl(0_0%_0%/0.32)]">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4">
        <NeupSearchBrand />
        {showSearch ? (
          <div className="flex-1">
            <SearchBar initialQuery={initialQuery} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {showThemeToggle ? <ThemeToggle /> : null}
      </div>
    </header>
  )
}
