import type { ReactNode } from "react"

import ManageServerLayout from "./layout.server"

// Merge the server and client layout layers for the manage route segment.
export default function ManageLayout({ children }: { children: ReactNode }) {
  return <ManageServerLayout>{children}</ManageServerLayout>
}
