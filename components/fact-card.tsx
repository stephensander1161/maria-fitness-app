"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
/** How long one fact stays up on a screen she does not leave. */
const FACT_EVERY_MS = 5 * 60_000;

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

  /*
    One fetch, however it was asked for.

    `revisit` is what makes any of this affordable: it re-reads what she has
    already been shown rather than spending a new fact from the library each
    time. The refresh button does spend one — she asked for something new, and
    that is what she gets. And where the screen has a subject, keep asking for
    that subject: a food fact on the food screens is the better half of this.
  */
  const swap = useCallback(async (signal: { live: boolean }) => {
    try {
      const got = await action<{ category: PickedFact["category"]; fact: string; source: string | null }>(
        "get_fact", { revisit: true, ...(prefer ? { category: prefer } : {}) },
      );
      if (signal.live) setFact({ category: got.category, text: got.fact, source: got.source });
    } catch {
      // The one she has is a perfectly good fact. Say nothing.
    }
  }, [prefer]);

  useEffect(() => {
    if (seenOn.current === where) return;
    seenOn.current = where;
    const signal = { live: true };
    void swap(signal);
    return () => { signal.live = false; };
  }, [where, swap]);

  /*
    …and on a timer, for the screen she stays on.

    Moving around the app changes it, which covers most of the day, but the
    Train screen during a session is one screen for forty minutes and the card
    under it went stale for all of them. Five minutes is the turnover of
    somebody who is reading it and not so fast that it moves while she is
    mid-sentence.

    Paused while the tab is hidden and caught up on the way back, because a
    phone in a pocket firing this every five minutes is a request an hour for
    a card nobody is looking at — and the first thing she wants on returning
    is a different one anyway.
  */
  useEffect(() => {
    const signal = { live: true };
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < FACT_EVERY_MS) return;
      last = Date.now();
      void swap(signal);
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      signal.live = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [swap]);

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
