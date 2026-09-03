"use client";

import { useState } from "react";
import { action, actionMessage } from "@/lib/client";
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

  async function another() {
    setBusy(true);
    setError(null);
    try {
      const got = await action<{ category: PickedFact["category"]; fact: string; source: string | null }>(
        "get_fact",
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
