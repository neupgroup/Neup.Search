import Link from "next/link"
import { Search } from "lucide-react"

export function NeupSearchBrand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Neup.Search home"
      className={`inline-flex items-center gap-2 font-semibold tracking-tight ${inverse ? "text-primary-foreground" : "text-foreground"}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${inverse ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}
      >
        <Search className="h-5 w-5" />
      </span>
      <span className="text-base">Neup.Search</span>
    </Link>
  )
}
