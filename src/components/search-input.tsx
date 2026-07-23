
"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { Input } from "@/components/ui/input"

export function SearchInput({ placeholder }: { placeholder: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set('q', term);
    } else {
      params.delete('q');
    }
    params.delete('startAfter'); // Reset cursor pagination on routes that still use it.
    params.delete('page'); // Reset page-number pagination on new search.
    replace(`${pathname}?${params.toString()}`);
  }, 3000);

  return (
    <Input
      type="search"
      placeholder={placeholder}
      className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
      onChange={(e) => handleSearch(e.target.value)}
      defaultValue={searchParams.get('q') || ''}
    />
  );
}
