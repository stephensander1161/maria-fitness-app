"use client";

import { barPaint, macroBar, type MacroRow } from "@/lib/macro-progress";

/**
 * The day's four numbers as bars, in one place.
 *
 * Three screens want this picture — the moment after something is logged, the
 * Eat card when she taps the tally, and Progress — and three drawings of it
 * would be three sets of rounding and three ideas about what "over" means.
 * The judgement lives in lib/macro-progress.ts and this only paints it.
 */
export function MacroBars({ rows, compact = false }: { rows: MacroRow[]; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {rows.map((row) => {
        const b = macroBar(row);
        const paint = barPaint(b);
        /*
          A gradient rather than a flat fill: the far end mixes toward `scrim`
          in proportion to how far along it is, so the bar deepens as it
          approaches the target and is richest when it gets there.

          Every macro is coloured, including a floor. The floor used to be
          painted in the neutral edge grey to mean "no verdict", and on a real
          day that came out as calories and protein in colour with carbs, fat
          and fibre in grey — which reads as three macros the app does not
          bother to colour, not as three numbers it cannot vouch for. It is
          hatched instead: the same colour, visibly provisional.
        */
        const fill = `linear-gradient(to right, var(${paint.role}), color-mix(in srgb, var(${paint.role}) ${100 - paint.depth}%, var(--color-scrim) ${paint.depth}%))`;
        return (
          <div key={b.key}>
            {/* The figure is the thing she came to read, so it is the biggest
                thing on the row — the label and the target stay small beside
                it. These bars replaced a grid of numbers that was set in 18px,
                and shrinking the number while removing its larger twin would
                have been a downgrade dressed as a tidy-up. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className={`uppercase tracking-wide text-faint ${compact ? "text-[10px]" : "text-[11px]"}`}>
                {b.label}
              </span>
              <span className={`tabular font-semibold ${compact ? "text-[13px]" : "text-[17px]"} ${
                b.state === "over" ? "text-miss" : b.state === "there" ? "text-beat" : "text-text"
              }`}>
                {/* A floor says so, here as everywhere else in the app. */}
                {b.complete ? "" : "≥"}{b.value}{b.suffix}
                {b.target !== null && (
                  <span className={`font-normal text-faint ${compact ? "text-[11px]" : "text-[12px]"}`}>
                    {" "}/ {b.target}{b.suffix}
                  </span>
                )}
                {b.over > 0 && (
                  <span className={`font-normal text-miss ${compact ? "text-[11px]" : "text-[12px]"}`}>
                    {" "}· {b.over} over
                  </span>
                )}
              </span>
            </div>
            <div
              /*
                `line`, not `raised`. The track was the same token as the card
                it sits on — on Eat the bars live inside a `bg-raised` box — so
                a bar at zero was invisible and an empty macro read as a macro
                the app does not track. An empty meter has to look empty, not
                absent.
              */
              className={`mt-1 w-full overflow-hidden rounded-full bg-line ${compact ? "h-1.5" : "h-2"}`}
              role="img"
              aria-label={`${b.label}: ${b.complete ? "" : "at least "}${b.value}${b.suffix}${
                b.target !== null ? ` of ${b.target}${b.suffix}` : ""
              }`}
            >
              {b.fill !== null && (
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.round(b.fill * 100)}%`,
                    backgroundImage: paint.hatched
                      // Narrow diagonal stripes over the same gradient. Drawn
                      // in `scrim` at low alpha rather than a second hue, so a
                      // floor reads as the macro's own colour, interrupted.
                      ? `repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-scrim) 55%, transparent) 0 3px, transparent 3px 6px), ${fill}`
                      : fill,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
