"use client";

import { useEffect, useRef } from "react";
import { line } from "@/lib/voice";
import type { Tone } from "@/lib/buddy";
import type { MacroBar } from "@/lib/macro-progress";

/**
 * A macro target reached, said the way a finished session is said.
 *
 * His request: "when a macro meter is full display a 'work out finished' style
 * screen celebrating the accomplishment. If multiple macros met at once, group
 * them onto the same celebration screen."
 *
 * The grouping is the part that needed thinking about. One meal regularly
 * carries three targets over at once — a big dinner lands calories, protein
 * and fat on the same tap — and three full-screen takeovers in a row for one
 * entry is not a celebration, it is a queue. So the moment is *the entry*, not
 * the macro: whatever crossed on that tap arrives together.
 *
 * Same rules as the session summary: it stays until she clears it, takes any
 * tap or key, and is not a modal, because there is nothing in it to interact
 * with and nothing behind it that needs blocking.
 *
 * It celebrates **reaching** a target and never **exceeding** one. Going over
 * is information for the next meal, not a verdict — the app has one rule about
 * food copy and this is it — so a macro that has run past its number is shown
 * with what she ate and no commentary at all.
 */
export function MacrosHit({
  bars, seed = "", tone = null, onClose,
}: {
  /** The ones that crossed on this entry. Never empty — the caller checks. */
  bars: MacroBar[];
  /** Chosen from this, so the line does not change while she reads it. */
  seed?: string;
  tone?: Tone | null;
  onClose: () => void;
}) {
  const closed = useRef(false);

  useEffect(() => {
    const go = () => {
      if (closed.current) return;
      closed.current = true;
      onClose();
    };
    /*
      A beat before it will take a tap.

      The tap that logged the meal is still going when this mounts, and without
      the delay that same gesture clears the screen it just earned — the bug
      the title screen hit first, and the reason it waits 600ms too.
    */
    const arm = window.setTimeout(() => {
      window.addEventListener("keydown", go);
      window.addEventListener("pointerdown", go);
    }, 600);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", go);
      window.removeEventListener("pointerdown", go);
    };
  }, [onClose]);

  if (bars.length === 0) return null;

  // "Protein" / "Calories and protein" / "Calories, protein and fat" — a list
  // anybody would read out loud, rather than three lines of the same sentence.
  const names = bars.map((b) => b.label);
  const headline = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  return (
    <div
      // Queued behind the session summary and the new title, the same way they
      // queue behind each other — see app/globals.css.
      data-celebration="macro"
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[90] grid place-items-center bg-ink/92 px-6 backdrop-blur-sm"
    >
      <span aria-hidden className="go-top absolute left-0 top-0 h-[3px] w-full bg-beat" />
      <span aria-hidden className="go-right absolute right-0 top-0 h-full w-[3px] bg-beat" />
      <span aria-hidden className="go-bottom absolute bottom-0 left-0 h-[3px] w-full bg-beat" />
      <span aria-hidden className="go-left absolute bottom-0 left-0 h-full w-[3px] bg-beat" />
      <span
        aria-hidden
        className="go-glow pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 90px 10px color-mix(in srgb, var(--color-beat) 40%, transparent)" }}
      />

      <div className="relative w-full max-w-sm text-center">
        <p className="go-sub text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
          {bars.length === 1 ? "Target hit" : `${bars.length} targets hit`}
        </p>
        <p className="go-word mt-3 text-[clamp(1.9rem,10vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-beat">
          {headline}
        </p>
        <p className="go-sub mt-4 text-[14px] text-muted">{line("macroHit", tone, seed)}</p>

        <dl className={`go-sub mt-7 grid gap-3 ${bars.length === 1 ? "grid-cols-1" : bars.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {bars.map((b) => (
            <div key={b.key} className="rounded-xl border border-line bg-surface/60 px-2 py-3">
              <dd className="text-[20px] font-semibold tabular text-text">
                {b.value}{b.suffix}
              </dd>
              <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-faint">
                {/* What she was aiming at, beside what she ate. Never "over":
                    going past a target is information for the next meal, and
                    this screen is not where the app has opinions about it. */}
                {b.label} · {b.target}{b.suffix}
              </dt>
            </div>
          ))}
        </dl>

        <p className="go-sub mt-8 text-[12px] text-faint">Tap anywhere to clear</p>
      </div>
    </div>
  );
}
