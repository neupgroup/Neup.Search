"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"

export type PageProgress = { label: string; percent: number }

// Render the page action's circular progress ring and blurred checkmark transition.
export function PageProgressIndicator({ progress }: { progress: PageProgress }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const [showCheckmark, setShowCheckmark] = useState(progress.percent === 100)
  const [isBlurred, setIsBlurred] = useState(false)

  useEffect(() => {
    const shouldShowCheckmark = progress.percent === 100
    if (showCheckmark === shouldShowCheckmark) return

    setIsBlurred(true)
    const transitionTimer = window.setTimeout(() => {
      setShowCheckmark(shouldShowCheckmark)
      window.requestAnimationFrame(() => setIsBlurred(false))
    }, 180)

    return () => window.clearTimeout(transitionTimer)
  }, [progress.percent, showCheckmark])

  const iconTransitionClass = `transition-all duration-200 ease-out ${isBlurred ? "scale-75 blur-sm opacity-0" : "scale-100 blur-0 opacity-100"}`

  return showCheckmark ? (
    <Check className={`h-5 w-5 shrink-0 text-primary ${iconTransitionClass}`} role="img" aria-label="Complete" />
  ) : (
    <svg className={`h-5 w-5 shrink-0 -rotate-90 ${iconTransitionClass}`} viewBox="0 0 40 40" role="img" aria-label="In progress">
      <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress.percent / 100)}
        className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
      />
      {progress.percent > 0 && progress.percent < 100 && (
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="8 93"
          className="origin-center animate-spin text-primary/70"
        />
      )}
    </svg>
  )
}
