import { ThemeToggle } from '@/components/theme-toggle'
import { SearchBar } from '@/components/search-bar'
import { NeupSearchBrand } from '@/components/neup-search-brand'

export default function Header({ initialQuery }: { initialQuery?: string }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 shadow-[0_12px_28px_hsl(var(--foreground)/0.18)] backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:shadow-[0_12px_28px_hsl(0_0%_0%/0.4)]">
      <div className="container mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <NeupSearchBrand />
        <div className="flex-1">
          <SearchBar initialQuery={initialQuery} />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
