"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { cardShown, orderFor, PAGE_CARDS, type CardLayout, type Page } from "@/lib/cards";

/**
 * The cards on this screen, in her order, with a way to change it.
 *
 * At the foot of the screen behind one small line, because it is used once
 * and then left alone — and never drag: on a scrolling phone page a drag
 * fights the scroll. Up, down, and an eye. Saved on the account through the
 * same tool the coach uses, and the screen re-reads itself, so what she sees
 * a moment later is exactly what is stored.
 */
export function ArrangeCards({ page, layout, collapsedCards }: {
  page: Page;
  layout: CardLayout | null;
  collapsedCards: string[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const order = orderFor(page, layout);
  const byId = new Map(PAGE_CARDS[page].map((c) => [c.id, c]));

  async function send(card: string, change: { move?: "up" | "down"; hidden?: boolean }) {
    setBusy(card);
    setError(null);
    try {
      await action("arrange_cards", { page, card, ...change });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] text-faint underline-offset-2 hover:text-muted hover:underline"
        >
          Arrange this screen
        </button>
      </div>
    );
  }

  return (
    <section className="card p-4" data-arrange={page}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold">Arrange this screen</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-muted">Done</button>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-faint">
        Top to bottom, as the screen shows them. Your coach can do this too: &ldquo;put the calculator at the top&rdquo;.
      </p>
      <ul className="mt-3 divide-y divide-line/60">
        {order.map((id, i) => {
          const card = byId.get(id)!;
          const shown = cardShown(page, layout, collapsedCards, id);
          const wait = busy === id;
          return (
            <li key={id} className={`flex items-center gap-2 py-2 ${shown ? "" : "text-faint"}`}>
              <span className="min-w-0 flex-1 text-[13px]">{card.label}{shown ? "" : " · hidden"}</span>
              <button
                type="button"
                aria-label={`Move ${card.label} up`}
                disabled={i === 0 || wait}
                onClick={() => void send(id, { move: "up" })}
                className="grid size-8 place-items-center rounded-full border border-line text-muted disabled:opacity-30"
              >↑</button>
              <button
                type="button"
                aria-label={`Move ${card.label} down`}
                disabled={i === order.length - 1 || wait}
                onClick={() => void send(id, { move: "down" })}
                className="grid size-8 place-items-center rounded-full border border-line text-muted disabled:opacity-30"
              >↓</button>
              {card.hideable ? (
                <button
                  type="button"
                  aria-label={shown ? `Hide ${card.label}` : `Show ${card.label}`}
                  aria-pressed={!shown}
                  disabled={wait}
                  onClick={() => void send(id, { hidden: shown })}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${shown ? "border-line text-muted" : "border-accent text-accent"}`}
                >
                  {shown ? "Hide" : "Show"}
                </button>
              ) : (
                <span className="w-[52px] text-center text-[11px] text-faint">stays</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </section>
  );
}
