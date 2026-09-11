"use client";

import Link from "next/link";
import { useState } from "react";
import { action } from "@/lib/client";
import { useTapAway } from "@/lib/use-tap-away";
import type { WhatsNew } from "@/lib/whats-new";

/**
 * "New since you were last here." Same bubble as the shipped-request note,
 * same corner, shown only when there is no request note to show — one
 * thing at a time. Dismissing it is one tap and remembered on the account,
 * so it never becomes the thing she closes every morning — and the tap can
 * land anywhere, not just on the button. See lib/use-tap-away.ts.
 */
export function WhatsNewNote({ items }: { items: WhatsNew[] }) {
  const [gone, setGone] = useState(false);

  /**
   * Away on the tap, saved behind it.
   *
   * It used to wait for the round trip before hiding — she pressed "Got it",
   * the button turned into an ellipsis, and the note sat there for as long as
   * the request took. On a slow connection that reads as a button that did not
   * work, and the second press has nothing left to do.
   *
   * Nothing of hers is in this note, so there is nothing to lose by being
   * optimistic: a failed save means it appears once more, which is the safe
   * direction for a thing whose whole job is to be read once.
   */
  function dismiss() {
    if (gone) return;
    setGone(true);
    // No refresh. The note removes itself here, and asking the server to
    // re-render before the write has landed is how it would come straight
    // back.
    void action("dismiss_whats_new").catch(() => { /* see above */ });
  }

  // Tapping anywhere else puts it away too — the button was the only way out,
  // and on a phone it sits low over the page she is trying to read. Safe here
  // because this note only ever tells her something; the shipped-request note
  // asks a question and keeps its buttons.
  const box = useTapAway<HTMLDivElement>(dismiss);
  if (gone || items.length === 0) return null;

  const shown = items.slice(0, 3);
  const more = items.length - shown.length;

  return (
    <div
      ref={box}
      role="status"
      className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm animate-[feature-rise_320ms_ease-out] md:inset-x-auto md:bottom-6 md:right-6 md:mx-0"
    >
      <div className="rounded-2xl border border-line bg-surface/95 p-4 shadow-lg shadow-scrim/50 backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">New since you were last here</p>
        <ul className="mt-2 space-y-2.5">
          {shown.map((e) => (
            <li key={e.id}>
              {e.href ? (
                <Link href={e.href} onClick={dismiss} className="text-[14px] font-medium leading-snug hover:text-accent">
                  {e.title}
                </Link>
              ) : (
                <p className="text-[14px] font-medium leading-snug">{e.title}</p>
              )}
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{e.blurb}</p>
            </li>
          ))}
        </ul>
        {more > 0 && <p className="mt-2 text-[12px] text-faint">and {more} more</p>}
        <button
          onClick={dismiss}
          className="mt-3 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-muted"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
