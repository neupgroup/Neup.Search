import type { Metadata } from "next"

import HeaderS2V2 from "@/components/header.s2.v2"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card"

export const metadata: Metadata = {
  title: "Settings | Neup.Search",
  description: "Manage your Neup.Search preferences.",
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderS2V2 showThemeToggle={false} />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your Neup.Search preferences.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose the theme used across Neup.Search.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle label="Choose theme" />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
