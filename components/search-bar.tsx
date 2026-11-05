"use client"

import { useState, useRef, type DragEvent, type ChangeEvent } from "react"
import Image from "next/image"
import { Search, Camera, UploadCloud, X } from "lucide-react"
import { search } from "@/lib/actions"
import { Input } from "@neup/components/ui/input"
import { Button } from "@neup/components/ui/button"

export function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const [image, setImage] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      setImage(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    handleFileChange(e.dataTransfer.files)
  }
  
  const handleRemoveImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = ""
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative transition-colors rounded-full ${isDragActive ? 'bg-primary/10' : ''}`}
    >
      <form action={search} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="search"
          name="query"
          placeholder="Ask anything or search by image..."
          className="w-full rounded-full bg-background/80 py-6 pl-12 pr-28 text-base shadow-lg focus-visible:ring-primary/50"
          defaultValue={initialQuery}
          aria-label="Search"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} aria-label="Search by image">
            <Camera className="h-5 w-5" />
          </Button>
        </div>
      </form>

      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-full border-2 border-dashed border-primary bg-background/80">
          <UploadCloud className="h-10 w-10 text-primary" />
          <p className="mt-2 text-lg font-semibold text-primary">Drop image to search</p>
        </div>
      )}
      
      <Input
        type="file"
        ref={fileInputRef}
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileChange(e.target.files)}
        className="hidden"
        accept="image/*"
      />

      {image && previewUrl && (
        <div className="mt-4 flex items-center gap-4 rounded-lg border p-2 bg-muted/50 animate-in fade-in-50">
          <Image
            src={previewUrl}
            alt="Image preview"
            width={48}
            height={48}
            className="rounded-md object-cover"
          />
          <span className="text-sm font-medium text-foreground truncate">{image.name}</span>
          <Button variant="ghost" size="icon" onClick={handleRemoveImage} className="ml-auto" aria-label="Remove image">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
