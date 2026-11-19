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
  Search,
  Tags,
  Users,
} from "lucide-react"

import HeaderSidebarLayout, {
  type SidebarLink,
} from "@neup/components/layout/headerSidebar.v1"
import { NeupSearchBrand } from "@/components/neup-search-brand"

// Compose the manage navigation with the active project query parameter.
function ManageLayoutContent({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const selectedPropertyId = searchParams.get("property") || undefined

  const buildManageHref = (href: string) => {
    if (href.startsWith("#") || !selectedPropertyId) return href
    return `${href}${href.includes("?") ? "&" : "?"}property=${encodeURIComponent(selectedPropertyId)}`
  }

  const sidebarLinks: SidebarLink[] = [
    { href: buildManageHref("/manage/projects"), label: "Projects", icon: Globe },
    { href: buildManageHref("/manage/sites"), label: "Sites", icon: Globe },
    ...(selectedPropertyId
      ? [{ href: buildManageHref(`/manage/sites/${selectedPropertyId}`), label: "My Site", icon: Globe }]
      : []),
    { href: buildManageHref("/manage"), label: "Overview", icon: Home },
    { href: buildManageHref("/manage/insights"), label: "Insights", icon: LineChart },
    { href: buildManageHref("/manage/search"), label: "Search", icon: Search },
    {
      label: "Performance",
      links: [
        { href: buildManageHref("/manage/performance"), label: "Home", icon: Home },
        { href: buildManageHref("/manage/performance/assist"), label: "Assist", icon: Bot },
        { href: buildManageHref("/manage/performance/search"), label: "Search", icon: Search },
        { href: buildManageHref("/manage/performance/discovery"), label: "Discovery", icon: Globe },
      ],
    },
    {
      label: "Discovery",
      links: [
        { href: buildManageHref("/manage/discovery"), label: "Home", icon: Globe },
        { href: buildManageHref("/manage/discovery/pages"), label: "Pages", icon: FileText },
        { href: buildManageHref("/manage/discovery/media"), label: "Media", icon: Files },
        { href: buildManageHref("/manage/discovery/sitemaps"), label: "Sitemaps", icon: Globe },
        { href: buildManageHref("/manage/discovery/binaries"), label: "Binaries", icon: Package },
        { href: buildManageHref("/manage/discovery/removals"), label: "Removals", icon: AlertTriangle },
      ],
    },
    {
      label: "Enhancements",
      links: [
        { href: buildManageHref("/manage/enhancements/site"), label: "Site", icon: Globe },
        { href: buildManageHref("/manage/enhancements/pages"), label: "Pages", icon: FileText },
      ],
    },
    { href: buildManageHref("/manage/categories"), label: "Categories", icon: Tags },
    { href: buildManageHref("/manage/neupbot"), label: "NeupBot", icon: Bot },
    { href: buildManageHref("/manage/links"), label: "Links", icon: Link2 },
    { href: buildManageHref("/manage/content"), label: "Content", icon: Files },
    { href: buildManageHref("/manage/errorrs"), label: "Crawl Errors", icon: AlertTriangle },
    { href: buildManageHref("/manage/indexing"), label: "Indexing", icon: Package },
    { href: buildManageHref("/manage/users"), label: "Users", icon: Users },
    { href: buildManageHref("/manage/analytics"), label: "Analytics", icon: LineChart },
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

export default function ManageClientLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ManageLayoutContent>{children}</ManageLayoutContent>
    </Suspense>
  )
}
