"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@neup/components/ui/button"
import { summarizePageAction, type SummaryActionState } from "../actions"

const initialSummaryState: SummaryActionState = { success: false }

// Show clear submit progress while the server generates and stores the summary.
function SummarySubmitButton({ disabled, generated }: { disabled: boolean; generated: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={disabled || pending}>
      {pending ? "Generating..." : generated ? "Summary Generated" : "Generate Summary"}
    </Button>
  )
}

// Submit only the page ID and display the summary returned by the server action.
export function SummaryForm({ pageId, hasContent }: {
  pageId: string
  hasContent: boolean
}) {
  const [state, action] = useActionState(summarizePageAction, initialSummaryState)
  const summary = state.result?.summary
  const isGenerated = Boolean(summary)

  if (isGenerated) {
    return <p className="text-sm text-muted-foreground">{summary}</p>
  }

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="pageId" value={pageId} />
        <SummarySubmitButton disabled={!hasContent || isGenerated} generated={isGenerated} />
      </form>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error.description}</p>}
    </div>
  )
}
