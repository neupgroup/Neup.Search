import { redirect } from "next/navigation"

// Keep the root URL pointed at the public home page.
export default function HomePage() {
  redirect("/home")
}
