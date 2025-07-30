import Link from 'next/link'
import { MountainIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { SearchBar } from '@/components/search-bar'

export default function Header({ initialQuery }: { initialQuery?: string }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" prefetch={false}>
          <MountainIcon className="h-6 w-6 text-primary" />
          <span className="sr-only">NeupSearch</span>
        </Link>
        <div className="flex-1">
          <SearchBar initialQuery={initialQuery} />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
