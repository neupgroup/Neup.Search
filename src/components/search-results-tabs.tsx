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

const webResults = [
  { title: "Official Next.js Documentation", url: "nextjs.org", snippet: "The official documentation for Next.js, featuring tutorials, API references, and guides to help you build fast, modern web applications." },
  { title: "Vercel: Develop. Preview. Ship.", url: "vercel.com", snippet: "Vercel is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration." },
  { title: "Genkit AI Framework | Google for Developers", url: "firebase.google.com", snippet: "Genkit is an open source framework from Google that helps you build, deploy, and monitor production-ready AI-powered apps using flows." },
  { title: "Tailwind CSS - Rapidly build modern websites", url: "tailwindcss.com", snippet: "A utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup." },
  { title: "Shadcn/UI - Beautifully designed components", url: "ui.shadcn.com", snippet: "Beautifully designed components that you can copy and paste into your apps. Accessible. Customizable. Open Source." },
]

const imageResults = Array(12).fill(0).map((_, i) => ({
  id: i,
  src: `https://placehold.co/400x300.png`,
  hint: i % 3 === 0 ? 'nature landscape' : (i % 3 === 1 ? 'city architecture' : 'abstract art')
}))

export default function SearchResultsTabs() {
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
        {webResults.map((result, index) => (
          <div key={index}>
            <a href={`https://${result.url}`} target="_blank" rel="noopener noreferrer" className="group">
              <p className="text-sm text-muted-foreground">{result.url}</p>
              <h3 className="text-lg font-headline text-primary group-hover:underline">{result.title}</h3>
              <p className="text-sm mt-1 text-foreground/80">{result.snippet}</p>
            </a>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="images">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {imageResults.map((img) => (
            <Card key={img.id} className="overflow-hidden group border-0 shadow-md">
              <Image
                src={img.src}
                alt={`Search result image ${img.id + 1}`}
                width={400}
                height={300}
                data-ai-hint={img.hint}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </Card>
          ))}
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
