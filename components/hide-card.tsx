"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import type { CardId } from "@/lib/cards";

/**
 * The way out of a card she does not want — the same icon the warm-up and
 * cool-down carry, for any card in lib/cards.ts. Hidden means not drawn;
 * the way back is Settings, or asking the coach.
 */
export function HideCard({ id, what }: { id: CardId; what: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function hide() {
    setBusy(true);
    setError(null);
    try {
      await action("set_card_collapsed", { card: id, collapsed: true });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "Couldn't hide that — try again."));
      setBusy(false);
    }
  }
  return (
    <>
    {error && <p role="alert" className="absolute right-10 top-1 whitespace-nowrap text-[12px] text-miss">{error}</p>}
    <button
      type="button"
      onClick={hide}
      disabled={busy}
      aria-label={`Hide ${what} — you can bring it back in Settings`}
      title="Hide — you can bring it back in Settings"
      className="grid size-8 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-50"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4 10 7a11.6 11.6 0 0 1-2.9 4.2M6.6 6.6A11.8 11.8 0 0 0 2 12c1 3 5 7 10 7a9.7 9.7 0 0 0 4.1-.9" />
      </svg>
    </button>
    </>
  );
}
