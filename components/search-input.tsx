
"use client"

import type { ComponentProps } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { Input } from "@neup/components/ui/input"

type SearchInputProps = {
  placeholder: string
  queryParam?: string
} & Omit<ComponentProps<typeof Input>, "type" | "placeholder" | "defaultValue" | "onChange">

export function SearchInput({ placeholder, queryParam = "q", ...props }: SearchInputProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set(queryParam, term);
    } else {
      params.delete(queryParam);
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
      defaultValue={searchParams.get(queryParam) || ''}
      {...props}
    />
  );
}
