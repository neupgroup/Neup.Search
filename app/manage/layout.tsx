"use client"

import type { ReactNode } from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Bot,
  FileText,
  Files,
  Globe,
  Home,
  Link2,
  LineChart,
  Package,
  Users,
} from "lucide-react"

import HeaderSidebarLayout, {
  type SidebarLink,
} from "@neup/components/layout/headerSidebar.v1"
import { NeupSearchBrand } from "@/components/neup-search-brand"

function ManageLayoutContent({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const selectedPropertyId = searchParams.get("property") || undefined

  const buildManageHref = (href: string) => {
    if (href.startsWith("#") || !selectedPropertyId || href === "/manage/neupbot") return href
    return `${href}${href.includes("?") ? "&" : "?"}property=${encodeURIComponent(selectedPropertyId)}`
  }

  const sidebarLinks: SidebarLink[] = [
    { href: buildManageHref("/manage/projects"), label: "Projects", icon: Globe },
    { href: buildManageHref("/manage"), label: "Dashboard", icon: Home },
    { href: buildManageHref("/manage/neupbot"), label: "NeupBot", icon: Bot },
    { href: buildManageHref("/manage/pages"), label: "Indexed Pages", icon: FileText },
    { href: buildManageHref("/manage/links"), label: "Links", icon: Link2 },
    { href: buildManageHref("/manage/content"), label: "Content", icon: Files },
    { href: buildManageHref("/manage/errorrs"), label: "Crawl Errors", icon: AlertTriangle },
    { href: buildManageHref("/manage/system/error"), label: "System Errors", icon: AlertTriangle },
    { href: "#indexing", label: "Indexing", icon: Package },
    { href: "#users", label: "Users", icon: Users },
    { href: "#analytics", label: "Analytics", icon: LineChart },
  ]

  const headerLinks = [
    <NeupSearchBrand key="brand" />,
  ]

  return (
    <HeaderSidebarLayout
      sidebarlinks={sidebarLinks}
      pofileBarInfo={{
        href: "/manage/projects",
        displayName: "Projects Management",
        displayImage: null,
        neupid: null,
      }}
      headerLinks={headerLinks}
    >
      {children}
    </HeaderSidebarLayout>
  )
}

export default function ManageLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ManageLayoutContent>{children}</ManageLayoutContent>
    </Suspense>
  )
}
