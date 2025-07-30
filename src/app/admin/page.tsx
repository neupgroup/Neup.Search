import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Admin</CardTitle>
              <CardDescription>
                Welcome to the admin page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>This is where you can manage your app.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
