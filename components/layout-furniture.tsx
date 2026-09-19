"use client";

import { usePathname } from "next/navigation";

/**
 * The fact and the coach are furniture under every screen — except the two
 * that arrange their cards, which draw them from their own list so they can
 * be moved and hidden like everything else there. "The stick man container
 * and did you know component both aren't sortable like the others are."
 */
const ARRANGED = new Set(["/train", "/eat"]);

export function LayoutFurniture({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (ARRANGED.has(path)) return null;
  return <>{children}</>;
}
