import { SearchBar } from "@/components/search-bar";
import { MountainIcon } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl px-4 space-y-4 text-center">
          <div className="inline-flex items-center justify-center gap-4">
            <MountainIcon className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tighter">
              NeupSearch
            </h1>
          </div>
          <p className="text-muted-foreground md:text-lg max-w-md mx-auto">
            A smarter way to search. Get AI-powered answers, not just links.
          </p>
          <div className="pt-4">
            <SearchBar />
          </div>
        </div>
      </main>
      <footer className="py-6 px-4 md:px-6 text-center text-sm text-muted-foreground">
        <p>Built with intelligence.</p>
      </footer>
    </div>
  );
}
