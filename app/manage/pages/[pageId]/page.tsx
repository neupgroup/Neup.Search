import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, CalendarDays, ExternalLink, Globe2, ListTree, Map, Network } from "lucide-react"
import { Badge } from "@neup/components/ui/badge"
import { Card, CardContent } from "@neup/components/ui/card"
import { Skeleton } from "@neup/components/ui/skeleton"
import { getPageById, getPageDiscoveryStatus, getPageSitemapReferences } from "../actions"
import { CrawlerDataPanel } from "./crawler-data-panel"
import { CrawlPageButton } from "./crawl-page-button"

// Hide manual crawling for records already identified as a non-HTML resource.
function isNonHtmlPage(page: { type: string; url: string }) {
  const contentType = page.type.toLowerCase().split(";")[0].trim()
  if (contentType.includes("/") && contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    return true
  }

  const pathname = new URL(page.url).pathname.toLowerCase()
  return /\.(?:pdf|jpe?g|png|gif|webp|svg|avif|ico|bmp|tiff?|mp4|webm|mov|m4v|avi|mpeg|mpg|ogv|mp3|wav|ogg|css|js|mjs|json|xml|zip|woff2?|ttf|eot)(?:$)/i.test(pathname)
}

// Format stored workflow values for compact status badges.
function formatStatus(status: string) {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase())
}

// Render a page detail card with a label, value, and optional detail.
function PageMetric({ icon: Icon, label, value, detail, compact = false, valueMuted = false }: {
  icon: typeof CalendarDays
  label?: string
  value: string
  detail?: string
  compact?: boolean
  valueMuted?: boolean
}) {
  return (
    <Card className="group border-border/70 bg-card/80 shadow-sm transition-colors hover:bg-muted/30">
      <CardContent className={`flex items-start justify-between gap-2 ${compact ? "p-2.5" : "min-h-20 p-3"}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="rounded-lg bg-primary/10 p-2 text-primary transition-transform duration-300 group-hover:rotate-3">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            {label && <p className="truncate text-sm font-semibold text-muted-foreground" title={label}>{label}</p>}
            <p className={`truncate text-sm font-semibold ${valueMuted ? "text-muted-foreground" : "text-foreground"}`} title={value}>{value}</p>
            {detail && <p className={`truncate text-sm font-semibold ${valueMuted ? "text-foreground" : "text-muted-foreground"}`} title={detail}>{detail}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Match discovery items to the compact card rows used on the projects page.
function DiscoveryCard({ icon: Icon, title, description, cornerClass }: {
  icon: typeof Globe2
  title: string
  description: string
  cornerClass: string
}) {
  return (
    <Card className={`w-full border-border/60 transition-colors hover:bg-muted/40 ${cornerClass}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="font-semibold">{title}</div>
            <div className="break-all text-sm text-muted-foreground">{description}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Load discovery sources after the page's core metadata is available.
async function DiscoveryStatusSection({ page }: { page: NonNullable<Awaited<ReturnType<typeof getPageById>>> }) {
  const [sitemapReferences, discoveryStatus] = await Promise.all([
    getPageSitemapReferences(page),
    getPageDiscoveryStatus(page.id),
  ])
  const discoveryCards = [
    ...(discoveryStatus?.outsideSiteCount
      ? [{ icon: Globe2, title: "External links", description: `${discoveryStatus.outsideSiteCount} pages from external sites link to this page.` }]
      : []),
    ...(discoveryStatus?.insideSiteCount
      ? [{ icon: Network, title: "Linked via internal pages", description: `${discoveryStatus.insideSiteCount} pages link to this page.` }]
      : []),
    {
      icon: Map,
      title: "Sitemaps",
      description: sitemapReferences.length === 0
        ? "No sitemap references found."
        : sitemapReferences.map((reference) => reference.sitemapUrl).join(", "),
    },
  ]

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight">Discovery status</h2>
        </div>
        <p className="text-sm text-muted-foreground">Where Neup Search found this page.</p>
      </header>
      <div>
        {discoveryCards.map((card, index) => {
          const cornerClass = index === 0
            ? "rounded-t-lg rounded-b-none"
            : index === discoveryCards.length - 1
              ? "rounded-b-lg rounded-t-none"
              : "rounded-none"
          return <DiscoveryCard key={card.title} icon={card.icon} title={card.title} description={card.description} cornerClass={cornerClass} />
        })}
      </div>
    </section>
  )
}

// Keep the discovery section shape visible while link and sitemap lookups run.
function DiscoveryStatusSkeleton() {
  return (
    <section className="space-y-4" aria-label="Loading discovery status" aria-busy="true">
      <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-56" /></div>
      <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
    </section>
  )
}

// Show the page overview, crawler inspection, and sitemap references.
export default async function PageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ pageId }, query] = await Promise.all([params, searchParams])
  const propertyValue = query.property
  const propertyId = Array.isArray(propertyValue) ? propertyValue[0] : propertyValue
  const backToPagesUrl = propertyId
    ? `/manage/pages?property=${encodeURIComponent(propertyId)}`
    : "/manage/pages"
  const page = await getPageById(pageId)

  if (!page) notFound()

  const displaySummary = page.summary || page.description || "No summary is available for this page yet."
  const addedDate = page.createdAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  const indexedDate = page.lastIndexed
    ? new Date(page.lastIndexed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "Not indexed yet"

  return (
    <div className="space-y-6 pb-6">
      <Link
        href={backToPagesUrl}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to pages
      </Link>

      <header className="space-y-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{page.title || "Untitled page"}</h1>
            <Link
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex max-w-full items-start gap-2 break-all text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <Globe2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{page.url}</span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
            </Link>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{displaySummary}</p>
          </div>

        </div>
      </header>

      <section aria-label="Page metadata" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {!isNonHtmlPage(page) && (
          <CrawlPageButton pageId={page.id} initiallyCrawling={page.isCrawling} isPaused={page.domainStatus === "paused"} />
        )}
        <PageMetric
          icon={BadgeCheck}
          value={formatStatus(page.status)}
          detail={page.category || "Uncategorized"}
          compact
          valueMuted
        />
        <PageMetric icon={CalendarDays} label="Added" value={addedDate} />
        <PageMetric icon={ListTree} label="Last indexed" value={indexedDate} />
      </section>

      <div className="pt-8">
        <CrawlerDataPanel url={page.url} />
      </div>

      <div className="pt-8">
        <Suspense fallback={<DiscoveryStatusSkeleton />}>
          <DiscoveryStatusSection page={page} />
        </Suspense>
      </div>
    </div>
  )
}
