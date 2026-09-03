"use client";

import { useState } from "react";
import { action, actionMessage } from "@/lib/client";
import type { PickedFact } from "@/lib/facts";

/**
 * One thing worth knowing, with more behind it.
 *
 * A single fact a day is the right default — a new one on every page load
 * would burn the library in an afternoon and mark every one of them read. But
 * "I want another" is a real want, and the card gave no way to say it. So the
 * day's fact is still the day's fact, and reading on is a deliberate tap.
 *
 * Ones she has already stepped through stay in the stack, because the natural
 * next thing after reading the next one is wanting the last one back.
 */
export function FactCard({ first }: { first: PickedFact }) {
  const [stack, setStack] = useState<PickedFact[]>([first]);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fact = stack[at];

  async function next() {
    // Back through ones she has already seen — no fetch, no fact burned.
    if (at < stack.length - 1) { setAt(at + 1); return; }
    setBusy(true);
    setError(null);
    try {
      const got = await action<{ category: PickedFact["category"]; fact: string; source: string | null }>(
        "get_fact",
      );
      setStack((s) => [...s, { category: got.category, text: got.fact, source: got.source }]);
      setAt((i) => i + 1);
    } catch (err) {
      setError(actionMessage(err, "Couldn't fetch another one."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="mt-8 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-wide text-accent">Did you know</p>
        {stack.length > 1 && (
          <p className="text-[10px] tabular text-faint">{at + 1} of {stack.length}</p>
        )}
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-text">{fact.text}</p>
      {fact.source && <p className="mt-1.5 text-[11px] text-faint">{fact.source}</p>}
      {error && <p role="alert" className="mt-1.5 text-[11px] text-miss">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        {at > 0 && (
          <button
            onClick={() => setAt(at - 1)}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted active:bg-raised"
          >
            Back
          </button>
        )}
        <button
          onClick={next}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted active:bg-raised disabled:opacity-50"
        >
          {busy ? "…" : at < stack.length - 1 ? "Next" : "Tell me another"}
        </button>
      </div>
    </aside>
  );
}
