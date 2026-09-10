"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * The screen she is on, as a path a link can come back to.
 *
 * The query string is part of the answer, not decoration: `/plan?w=2026-09-14`
 * and `/train?d=2026-09-11` are different screens, and dropping it returns her
 * to this week's Monday rather than the day she was actually looking at.
 */
export function useBackHere(): string {
  const path = usePathname();
  const params = useSearchParams().toString();
  return params ? `${path}?${params}` : path;
}
