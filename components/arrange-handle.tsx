"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { PAGE_CARDS, type Page } from "@/lib/cards";

/**
 * The grip on a card, for moving it.
 *
 * It was a panel at the foot of the screen — "I don't like arrange this
 * screen being its own card; it should live in each of the cards, like the
 * movement cards." So: a small grip riding each card's top edge, the same
 * mark the movement cards carry. Tap it and the card offers up, down and
 * hide, and nothing else on the screen changes shape. Not drag: a whole
 * card under a thumb on a scrolling page fights the scroll. Saved on the
 * account through the coach's own tool, and the screen re-reads itself.
 */
export function ArrangeHandle({ page, id, first, last }: { page: Page; id: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const card = PAGE_CARDS[page].find((c) => c.id === id);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  async function send(change: { move?: "up" | "down"; hidden?: boolean }) {
    setBusy(true); setError(null);
    try {
      await action("arrange_cards", { page, card: id, ...change });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) { setError(actionMessage(err, "That didn't save — try again.")); }
    finally { setBusy(false); }
  }

  if (!card) return null;
  const label = card.label.toLowerCase();
  return (
    <div ref={box} data-arrange-handle={id} className="absolute -top-2.5 right-3 z-10 flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Move or hide ${label}`}
        title="Move or hide"
        className={`grid h-5 w-8 place-items-center rounded-full border bg-surface text-faint transition-colors hover:text-muted ${open ? "border-accent text-accent" : "border-line"}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="8" cy="6" r="1.8" /><circle cx="16" cy="6" r="1.8" />
          <circle cx="8" cy="12" r="1.8" /><circle cx="16" cy="12" r="1.8" />
          <circle cx="8" cy="18" r="1.8" /><circle cx="16" cy="18" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="mt-1 flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg shadow-scrim/40">
          <button type="button" disabled={first || busy} onClick={() => void send({ move: "up" })} aria-label={`Move ${label} up`}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-30">↑</button>
          <button type="button" disabled={last || busy} onClick={() => void send({ move: "down" })} aria-label={`Move ${label} down`}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-30">↓</button>
          {card.hideable && (
            <button type="button" disabled={busy} onClick={() => void send({ hidden: true })} aria-label={`Hide ${label} — Settings brings it back`}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:bg-raised disabled:opacity-30">Hide</button>
          )}
          {error && <span role="alert" className="px-1 text-[11px] text-miss">{error}</span>}
        </div>
      )}
    </div>
  );
}
