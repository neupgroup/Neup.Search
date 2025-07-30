"use client"

import { useEffect, useState, useTransition } from "react"
import { Sparkles } from "lucide-react"
import { generateAnswer } from "@/app/search/actions"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function AIQA({ query }: { query: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ answer: string | null; error: string | null } | null>(null)

  useEffect(() => {
    if (query) {
      setResult(null); // Reset on new query
      startTransition(async () => {
        const res = await generateAnswer(query)
        setResult(res)
      })
    } else {
      setResult(null)
    }
  }, [query])

  if (!query) {
    return null
  }

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-headline">
            <Sparkles className="h-5 w-5 text-primary" />
            Generating answer...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    )
  }

  if (result?.error) {
    return (
        <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
        </Alert>
    )
  }

  if (result?.answer) {
    return (
      <Card className="shadow-lg animate-in fade-in-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Generated Answer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className="text-foreground/90 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: result.answer.replace(/\n/g, "<br />") }}
          />
        </CardContent>
      </Card>
    )
  }

  return null
}
