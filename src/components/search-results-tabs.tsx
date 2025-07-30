
"use client"

import Image from "next/image"
import { FileText, Filter, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type SearchResult } from "@/app/search/actions"

const imageResults = Array(12).fill(0).map((_, i) => ({
  id: i,
  src: `https://placehold.co/400x300.png`,
  hint: i % 3 === 0 ? 'nature landscape' : (i % 3 === 1 ? 'city architecture' : 'abstract art')
}))

export default function SearchResultsTabs({ query, initialWebResults }: { query: string, initialWebResults: SearchResult[] }) {
  return (
    <Tabs defaultValue="web" className="w-full">
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-6">
        <TabsList>
          <TabsTrigger value="web">Web</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2 ml-auto">
          <Select defaultValue="all-time">
            <SelectTrigger className="w-auto md:w-[180px] h-9 text-sm">
              <SelectValue placeholder="Filter by date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All time</SelectItem>
              <SelectItem value="past-day">Past day</SelectItem>
              <SelectItem value="past-week">Past week</SelectItem>
              <SelectItem value="past-month">Past month</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9">
                <Filter className="h-4 w-4 mr-0 md:mr-2" />
                <span className="hidden md:inline">All Filters</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Source: All</DropdownMenuItem>
              <DropdownMenuItem>Source: News</DropdownMenuItem>
              <DropdownMenuItem>Source: Blogs</DropdownMenuItem>
              <DropdownMenuItem>Type: All</DropdownMenuItem>
              <DropdownMenuItem>Type: PDF</DropdownMenuItem>
              <DropdownMenuItem>Type: DOCX</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent value="web" className="space-y-6">
        {initialWebResults.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
                <p className="text-lg font-medium">No results found for "{query}".</p>
                <p className="mt-2">Try checking your spelling or using different keywords.</p>
                <p>You may also need to crawl more sites in the manage section.</p>
            </div>
        )}
        {initialWebResults.map((result, index) => (
          <div key={index}>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="group">
              <p className="text-sm text-muted-foreground">{result.url}</p>
              <h3 className="text-lg font-headline text-primary group-hover:underline">{result.title}</h3>
              <p className="text-sm mt-1 text-foreground/80">{result.snippet}</p>
            </a>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="images">
        <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg bg-muted/50 py-12">
            <h3 className="font-headline text-lg font-semibold">Coming Soon</h3>
            <p className="text-muted-foreground text-sm">Image search is not yet available.</p>
        </div>
      </TabsContent>

      <TabsContent value="videos" className="min-h-64">
        <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg bg-muted/50 py-12">
          <Video className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-headline text-lg font-semibold">Video Results</h3>
          <p className="text-muted-foreground text-sm">Video search results will appear here.</p>
        </div>
      </TabsContent>
      
      <TabsContent value="documents" className="min-h-64">
        <div className="flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg bg-muted/50 py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-headline text-lg font-semibold">Document Results</h3>
          <p className="text-muted-foreground text-sm">Document search results will appear here.</p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
