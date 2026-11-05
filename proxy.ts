import { NextRequest, NextResponse } from "next/server"

// Send manage pages without a selected project to the project picker.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname || "/"
  const isManageRoute = pathname === "/manage" || pathname.startsWith("/manage/")
  const isProjectPickerRoute =
    pathname === "/manage/projects" || pathname.startsWith("/manage/projects/")
  const selectedProjectId =
    request.nextUrl.searchParams.get("project") || request.nextUrl.searchParams.get("property")

  if (!isManageRoute || isProjectPickerRoute || selectedProjectId) {
    return NextResponse.next()
  }

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/manage/projects"
  redirectUrl.search = ""

  return NextResponse.redirect(redirectUrl)
}
