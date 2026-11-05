import type { ReactNode } from "react"

import ManageClientLayout from "./layout.client"

// Provide the server-side boundary for the interactive manage layout.
export default function ManageServerLayout({ children }: { children: ReactNode }) {
  return <ManageClientLayout>{children}</ManageClientLayout>
}
