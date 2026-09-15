"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { cardOpen, type CardId } from "@/lib/cards";

/**
 * Whether Train draws the warm-up and the cool-down at all.
 *
 * They are one closed line each and cost almost nothing, which is exactly why
 * they had no way out: nothing that cheap looks worth a setting until you are
 * the person scrolling past both of them four times a week. His request, and
 * the second half of it is the part that matters — "add hide icon to the cards
 * so user knows they can be hidden". A preference nobody can find from the
 * thing it is about is a preference nobody has.
 *
 * So this screen is the way *back*, and the icon on the card is the way out.
 * Stored in `profiles.collapsed_cards` with everything else she has folded
 * away, which is an account column rather than a browser one, so the choice
 * follows her between her phone and a laptop.
 */
const ROWS: { card: CardId; label: string; about: string }[] = [
  { card: "warmUp", label: "Warm-up", about: "A few reps of what the day trains, before the first set." },
  { card: "coolDown", label: "Cool-down", about: "Holds, after the lifting, when they cost nothing." },
];

export function StretchVisibility({ collapsedCards }: { collapsedCards: string[] | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function set(card: CardId, show: boolean) {
    setBusy(card);
    setError(null);
    try {
      await action("set_card_collapsed", { card, collapsed: !show });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">Warm-up and cool-down</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Both sit closed at one line on the Train screen. Turn one off and it is not drawn at
        all — you can bring it back here, or ask your coach.
      </p>
      <div className="mt-3 space-y-2">
        {ROWS.map((row) => {
          const shown = cardOpen(collapsedCards, row.card);
          return (
            <button
              key={row.card}
              onClick={() => set(row.card, !shown)}
              disabled={busy !== null}
              role="switch"
              aria-checked={shown}
              className="flex w-full items-center gap-3 rounded-xl border border-edge px-3 py-2.5 text-left active:bg-raised disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">{row.label}</span>
                <span className="block text-[12px] text-faint">{row.about}</span>
              </span>
              {/* The track is `edge`, not `line`: it is a control's outline and
                  has to clear 3:1 on every surface — see CLAUDE.md. */}
              <span
                aria-hidden
                className={`flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 transition-colors ${
                  shown ? "justify-end border-accent bg-accent" : "justify-start border-edge"
                }`}
              >
                <span className={`block size-4 rounded-full ${shown ? "bg-on-accent" : "bg-edge"}`} />
              </span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </section>
  );
}
