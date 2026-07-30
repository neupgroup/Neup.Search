
"use client"

import Link from "next/link"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Home,
  Package,
  FileText,
  Users,
  LineChart,
  Globe,
  AlertTriangle,
  Files,
  Bot,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import HeaderS2V2 from "@/components/header.s2.v2"

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedPropertyId = searchParams.get("property") || undefined

  useEffect(() => {
    if (pathname === "/manage/properties" || pathname === "/manage/properties/add") return
    if (selectedPropertyId) return

    router.replace("/manage/properties")
  }, [pathname, router, selectedPropertyId])

  const buildManageHref = (href: string) => {
    if (href === "#" || !selectedPropertyId) return href
    const separator = href.includes("?") ? "&" : "?"
    return `${href}${separator}property=${encodeURIComponent(selectedPropertyId)}`
  }

  const navLinks: { href: string; label: string; icon: any; badge?: string }[] = [
    { href: "/manage/properties", label: "Properties", icon: Globe },
    { href: "/manage", label: "Dashboard", icon: Home },
    { href: "/manage/neupbot", label: "NeupBot", icon: Bot },
    { href: "/manage/sites", label: "Crawled Sites", icon: Globe },
    { href: "/manage/pages", label: "Indexed Pages", icon: FileText },
    { href: "/manage/content", label: "Content", icon: Files },
    { href: "/manage/errorrs", label: "Crawl Errors", icon: AlertTriangle },
    { href: "/manage/system/error", label: "System Errors", icon: AlertTriangle },
    { href: "#", label: "Indexing", icon: Package },
    { href: "#", label: "Users", icon: Users },
    { href: "#", label: "Analytics", icon: LineChart },
  ]

  return (
    <div className="min-h-screen bg-white">
      <HeaderS2V2 />
      <div className="mx-auto w-full max-w-[1440px]">
        <aside className="fixed bottom-0 left-[max(0px,calc((100vw-1440px)/2))] top-16 hidden w-[220px] overflow-y-auto border-r border-border/60 bg-white md:block lg:w-[280px]">
          <div className="flex min-h-full flex-col gap-2 px-4 pt-4 pb-4 lg:px-5 lg:pt-8 lg:pb-5">
            <nav className="grid items-start gap-1 text-sm font-medium">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={buildManageHref(link.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground transition-all hover:bg-muted hover:text-primary",
                    (pathname === link.href || (link.href !== "/manage" && pathname.startsWith(link.href))) &&
                      "bg-muted text-primary"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                  {link.badge && (
                    <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      {link.badge}
                    </Badge>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <main className="flex min-h-0 flex-col gap-4 bg-white p-4 md:pl-[252px] lg:gap-6 lg:p-8 lg:pl-[312px]">
          {children}
        </main>
      </div>
    </div>
  )
}
