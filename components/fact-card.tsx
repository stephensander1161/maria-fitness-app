"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { preferredCategory } from "@/lib/fact-screen";
import type { PickedFact } from "@/lib/facts";

/**
 * One thing worth knowing, with more behind it.
 *
 * A single fact a day is the right default — a new one on every page load
 * would burn the library in an afternoon and mark every one of them read. But
 * "I want another" is a real want, and the card gave no way to say it.
 *
 * One control, in the corner, the size of a control that does one small
 * thing. A Back button and a "Tell me another" turned a quiet footer into a
 * wizard.
 */
export function FactCard({ first }: { first: PickedFact }) {
  const [fact, setFact] = useState(first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    On the food screens, a food fact.

    The day's fact is drawn on the server without knowing which page asked —
    a server component cannot see the path, and threading one through the
    proxy to tell it is a lot of moving parts for a footer. The card knows
    where it is, so it swaps its own: once, only where the screen has a
    subject, and only when the one it was handed is about something else.
  */
  const path = usePathname();
  const params = useSearchParams().toString();
  /*
    A different fact on every screen, and on every sub-tab.

    It used to swap only where the screen had a subject and the fact it was
    handed was about something else — so walking Train → Progress → Kitchen
    showed the same sentence three times, and the Plan tabs never changed it
    at all because the path does not move between them.

    The server draws the first one; after that this is what changes it. Free,
    in the sense that matters: `get_fact` is a row out of the library, not a
    model call.
  */
  const where = `${path}?${params}`;
  const seenOn = useRef(where);
  const prefer = preferredCategory(path);
  useEffect(() => {
    if (seenOn.current === where) return;
    seenOn.current = where;
    let live = true;
    void (async () => {
      try {
        const got = await action<{ category: PickedFact["category"]; fact: string; source: string | null }>(
          // `revisit` is what makes this affordable: walking around the app
          // re-reads what she has already been shown rather than spending a
          // new fact per screen. The refresh button below does spend one —
          // she asked for something new, and that is what she gets.
          //
          // And where the screen has a subject, keep asking for that subject:
          // a food fact on the food screens is the better half of this.
          "get_fact", { revisit: true, ...(prefer ? { category: prefer } : {}) },
        );
        if (live) setFact({ category: got.category, text: got.fact, source: got.source });
      } catch {
        // The one she has is a perfectly good fact. Say nothing.
      }
    })();
    return () => { live = false; };
  }, [where, prefer]);

  async function another() {
    setBusy(true);
    setError(null);
    try {
      const got = await action<{ category: PickedFact["category"]; fact: string; source: string | null }>(
        "get_fact", prefer ? { category: prefer } : undefined,
      );
      setFact({ category: got.category, text: got.fact, source: got.source });
    } catch (err) {
      setError(actionMessage(err, "Couldn't fetch another one."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="mt-8 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-accent">Did you know</p>
          <p className="mt-1 text-[13px] leading-relaxed text-text">{fact.text}</p>
          {fact.source && <p className="mt-1.5 text-[11px] text-faint">{fact.source}</p>}
          {error && <p role="alert" className="mt-1.5 text-[11px] text-miss">{error}</p>}
        </div>
        <button
          onClick={another}
          disabled={busy}
          aria-label="Another fact"
          className={`-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-40 ${
            busy ? "animate-spin" : ""
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
