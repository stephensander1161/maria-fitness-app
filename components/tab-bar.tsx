"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Four tabs, not five. The coach used to be one of them, which meant leaving
 * whatever she was looking at in order to ask about it; it is a bubble on
 * every screen now — see components/coach-bubble.tsx.
 */
/** Shared with the desktop sidebar, so the two can never drift apart. */
export const TABS = [
  { href: "/train", label: "Train", icon: "M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" },
  { href: "/plan", label: "Plan", icon: "M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M8 3v4M16 3v4M8 12h8M8 16h5" },
  { href: "/progress", label: "Progress", icon: "M4 19V5M4 19h16M7.5 15l3.5-4 3 2.5L19 8" },
  { href: "/learn", label: "Learn", icon: "M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5ZM8 7.5h7M8 11h5" },
];

const CHROMELESS = new Set(["/login", "/welcome"]);

export function TabBar() {
  const path = usePathname();
  if (CHROMELESS.has(path)) return null;

  return (
    // Thumb-first, and hidden the moment there is a sidebar instead.
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/90 backdrop-blur-xl md:hidden">
      <div
        className="mx-auto grid max-w-lg grid-cols-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        {TABS.map((tab) => {
          const active = path.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 pt-2.5 pb-1 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-faint"
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
