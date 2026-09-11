"use client";

import { useState } from "react";
import { action } from "@/lib/client";
import type { CardId } from "@/lib/cards";

/**
 * A card she can fold away, remembered on the account.
 *
 * Open by default and open on first sight: a card that arrives closed is one
 * she has to discover, and what it holds is what teaches her it is worth
 * having. Only a deliberate tap puts it away.
 *
 * The toggle is applied on the tap and saved behind it. A fold that waits for
 * a round trip feels broken on a slow connection, and there is nothing at
 * stake in the write — the worst case is that it opens again next time, which
 * is the safe direction for a thing that hides content.
 */
export function FoldableCard({
  id, title, aside, startOpen, children,
}: {
  id: CardId;
  title: string;
  /** Shown beside the title, and only while open. */
  aside?: React.ReactNode;
  startOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Best effort: if it does not save, the card is open again next time.
    void action("set_card_collapsed", { card: id, collapsed: !next })
      .catch(() => { /* see above */ });
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" aria-hidden
            className={`shrink-0 text-faint transition-transform ${open ? "" : "-rotate-90"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
        </button>
        {open && aside}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
