"use client";

import Link from "next/link";
import { movementHref } from "@/lib/back-to";
import { useState } from "react";

/**
 * What to loosen off before, and what to hold after.
 *
 * Built out of the library that already had it: forty-two mobility movements
 * were seeded long before this, with cues, mistakes, safety notes and
 * animations. Adding parallel copies is the mistake the postpartum work nearly
 * made and `tests/exercises.test.ts` caught, so nothing new was written — this
 * only puts the right four in front of her.
 *
 * Closed by default and one line tall. A warm-up she has to scroll past to
 * reach the first set is a warm-up that makes the app worse for the person who
 * does not want one, and this app's whole premise is that the session is what
 * she came for.
 *
 * The split matters and is not cosmetic: before a session these are movements,
 * because holding a stretch immediately before lifting measurably lowers force
 * output. After it, they are holds.
 */
export function StretchBlock({
  title, hint, items, from, tone = "quiet",
}: {
  title: string;
  hint: string;
  items: { slug: string; name: string }[];
  /** Where back should go — she came from the day, not from the library. */
  from: string;
  tone?: "quiet" | "rest";
}) {
  const [open, setOpen] = useState(tone === "rest");
  if (items.length === 0) return null;

  return (
    <section className={`card mb-3 overflow-hidden ${tone === "rest" ? "" : "bg-transparent"}`}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">{title}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-faint">{hint}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" aria-hidden
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul className="px-2 pb-2">
          {items.map((item) => (
            <li key={item.slug}>
              {/* Straight to the movement's own page: the cues, the mistakes
                  and the stick figure are already written for every one of
                  these, and none of it needed repeating here. It carries where
                  she was, so back comes here and not to the library. */}
              <Link
                href={movementHref(item.slug, from)}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-[14px] text-muted active:bg-raised"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span aria-hidden className="shrink-0 text-[11px] text-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
