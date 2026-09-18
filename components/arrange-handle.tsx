"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { PAGE_CARDS, type CardId, type Page } from "@/lib/cards";

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
export function ArrangeHandle(props:
  | { page: Page; id: string; first: boolean; last: boolean; hide?: undefined }
  /** A card that is not arranged, only hidden or shown — the one grip for both. */
  | { page?: undefined; id?: undefined; first?: undefined; last?: undefined; hide: { card: CardId; label: string; hidden: boolean } },
) {
  const { page, id, first, last, hide } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const card = hide
    ? { id: hide.card, label: hide.label, hideable: true }
    : PAGE_CARDS[page].find((c) => c.id === id);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  async function send(change: { move?: "up" | "down"; hidden?: boolean }) {
    setBusy(true); setError(null);
    try {
      if (hide) await action("set_card_collapsed", { card: hide.card, collapsed: change.hidden });
      else await action("arrange_cards", { page, card: id, ...change });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) { setError(actionMessage(err, "That didn't save — try again.")); }
    finally { setBusy(false); }
  }

  if (!card) return null;
  const label = card.label.toLowerCase();
  const menuLabel = hide ? (hide.hidden ? `Show ${label}` : `Hide ${label}`) : `Move or hide ${label}`;
  return (
    // Inside the card, in its top padding: a short grabber bar, centred — the
    // mark a sheet carries, and one nothing in a card's header row sits under.
    // A pill on the border looked like it was falling off the card.
    <div ref={box} data-arrange-handle={card.id} className="absolute inset-x-0 top-0 z-10 flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={menuLabel}
        title={hide ? (hide.hidden ? "Show" : "Hide") : "Move or hide"}
        className="group -mt-px px-6 pb-1.5 pt-1.5"
      >
        <span className={`block h-1 w-8 rounded-full transition-colors ${open ? "bg-accent" : "bg-line group-hover:bg-faint"}`} />
      </button>
      {open && (
        <div className="-mt-0.5 flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg shadow-scrim/40">
          {!hide && (
            <>
              <button type="button" disabled={first || busy} onClick={() => void send({ move: "up" })} aria-label={`Move ${label} up`}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-30">↑</button>
              <button type="button" disabled={last || busy} onClick={() => void send({ move: "down" })} aria-label={`Move ${label} down`}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-30">↓</button>
            </>
          )}
          {card.hideable && (
            <button type="button" disabled={busy} onClick={() => void send({ hidden: !hide?.hidden })}
              aria-label={hide?.hidden ? `Show ${label}` : `Hide ${label} — Settings brings it back`}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-muted hover:bg-raised disabled:opacity-30">{hide?.hidden ? "Show" : "Hide"}</button>
          )}
          {error && <span role="alert" className="px-1 text-[11px] text-miss">{error}</span>}
        </div>
      )}
    </div>
  );
}
