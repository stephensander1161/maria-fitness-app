"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./tab-bar";
import { FeedbackNavItem } from "./feedback";
import type { Title } from "@/lib/titles";

/**
 * The desktop navigation.
 *
 * The app was built thumb-first — a bottom tab bar, sheets that rise from the
 * bottom edge, a pull gesture to refresh — which is right on a phone and
 * strange on a 27-inch screen, where the bottom edge is a long way from
 * anything and there is no thumb. Same destinations, moved to where a mouse
 * already is.
 */
const CHROMELESS = new Set(["/login", "/welcome"]);

export function SideNav({ name, title }: { name: string | null; title: Title }) {
  const path = usePathname();
  if (CHROMELESS.has(path)) return null;

  return (
    <nav
      aria-label="Sections"
      className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface/40 px-3 py-6 md:flex md:h-dvh md:overflow-y-auto"
    >
      <div className="px-3 pb-6">
        {name && <p className="truncate text-[15px] font-semibold">{name}</p>}
        {/*
          A rank she earns by turning up, in place of the app's own name. It
          only ever goes up — see lib/titles.ts — so this can never be the
          thing that greets her after a bad fortnight.
        */}
        {/* Wraps rather than truncating: there is room in a sidebar, and a
            rank she cannot read is not a reward. Whole words only. */}
        <p className="mt-1 text-[11px] font-medium uppercase leading-snug tracking-widest text-accent [overflow-wrap:normal]" title={title.blurb}>
          {title.name}
        </p>
        <span className="sr-only">{title.blurb}</span>
        {title.next && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised" title={`Next: ${title.next}`}>
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${title.progress}%` }} />
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {TABS.map((tab) => {
          const active = path.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors ${
                  active ? "bg-accent-soft text-accent" : "text-muted hover:bg-raised"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/*
        "Tell us" belongs in the navigation on a desktop, not floating over the
        bottom-left corner where it landed on top of the refresh button it now
        replaces. Screens refresh themselves when she comes back to the tab —
        see RefreshOnFocus.
      */}
      <div className="mt-auto pt-4">
        <FeedbackNavItem />
      </div>
    </nav>
  );
}
