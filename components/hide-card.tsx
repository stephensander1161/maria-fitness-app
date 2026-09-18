"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { CardId } from "@/lib/cards";

/**
 * The way out of a card she does not want, and the way back in — one eye,
 * crossed while the card shows and open while it is hidden, for any card in
 * lib/cards.ts. "Since the card never fully goes away we can keep the eye
 * icon to unhide right from there." Settings and the coach do the same.
 */
export function HideCard({ id, what, hidden = false }: { id: CardId; what: string; hidden?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function flip() {
    setBusy(true);
    setError(null);
    try {
      await action("set_card_collapsed", { card: id, collapsed: !hidden });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
      setBusy(false);
    }
  }
  return (
    <>
    {error && <p role="alert" className="absolute right-10 top-1 whitespace-nowrap text-[12px] text-miss">{error}</p>}
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      aria-label={hidden ? `Show ${what}` : `Hide ${what} — the eye brings it back`}
      title={hidden ? "Show" : "Hide — the eye brings it back"}
      aria-pressed={hidden}
      className="grid size-8 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-50"
    >
      {hidden ? (
        // An open eye: the card is hidden, and this shows it again.
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12c1-3 5-7 10-7s9 4 10 7c-1 3-5 7-10 7S3 15 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4 10 7a11.6 11.6 0 0 1-2.9 4.2M6.6 6.6A11.8 11.8 0 0 0 2 12c1 3 5 7 10 7a9.7 9.7 0 0 0 4.1-.9" />
        </svg>
      )}
    </button>
    </>
  );
}
