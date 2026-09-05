/**
 * The mark.
 *
 * Three things it has to do, and the old barbell outline did none of them
 * well: read at 16px in a browser tab, survive seven themes without being
 * restated, and look like something rather than like a default.
 *
 * So it is drawn from theme tokens — `currentColor` and the accent — never
 * from a hex. A gradient is defined per instance because two marks on one page
 * would otherwise share an id and the second would render blank.
 */

import { barbellFor } from "@/lib/brand";

export type LogoMark = "arc" | "monogram" | "stack";

export function Logo({
  mark = "arc",
  size = 40,
  className = "",
}: {
  mark?: LogoMark;
  size?: number;
  className?: string;
}) {
  /*
   * Deterministic, not a counter.
   *
   * Two marks on one page do share this id, and that is fine: every instance
   * of a given mark defines the *same* gradient over the same 48-unit box, so
   * whichever the browser resolves first is the right one. The counter this
   * replaced incremented during render, which is a side effect React is
   * entitled to run twice — and the lint rule was right to refuse it.
   */
  const id = `plate-mark-${mark}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Plate"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-accent)" />
          {/* Toward the page rather than toward white: on a light theme a
              white-ended gradient disappears into the card behind it. */}
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* The badge. A squircle rather than a circle — it sits better next to
          rounded-rect app icons and does not read as a status dot. */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="14" fill={`url(#${id})`} />

      {mark === "arc" && (() => {
        /*
         * A loaded bar on the way up.
         *
         * The geometry lives in lib/brand.ts so the PNG icon routes draw the
         * same thing, and it changes below 22px — three strokes inside eleven
         * usable pixels is mush, so the small one is shorter and fatter. See
         * the note there.
         */
        const g = barbellFor(size);
        return (
          <g stroke="var(--color-on-accent)" strokeLinecap="round" fill="none">
            <path d={g.bar.d} strokeWidth={g.bar.width} />
            <path d={g.plates.d} strokeWidth={g.plates.width} />
          </g>
        );
      })()}

      {mark === "monogram" && (
        /*
         * A C whose ends are plate-heavy, so it reads as a letter at a glance
         * and as a loaded bar up close.
         */
        <g stroke="var(--color-on-accent)" fill="none" strokeLinecap="round">
          <path d="M33 16.5a11 11 0 1 0 0 15" strokeWidth="4.2" />
          <path d="M33.5 12.5v8M33.5 27.5v8" strokeWidth="3.4" />
        </g>
      )}

      {mark === "stack" && (
        /*
         * Three bars, shortest at the bottom: a plate stack and a rising chart
         * at the same time. The most legible of the three at 16px.
         */
        <g fill="var(--color-on-accent)">
          <rect x="12" y="28" width="24" height="5.5" rx="2.75" />
          <rect x="15" y="20" width="18" height="5.5" rx="2.75" opacity="0.82" />
          <rect x="18" y="12" width="12" height="5.5" rx="2.75" opacity="0.62" />
        </g>
      )}
    </svg>
  );
}

/**
 * Mark plus name, for the places that are the app introducing itself: the
 * sign-in screen, the first run, the head of the desktop nav.
 */
export function Wordmark({
  mark = "arc",
  size = 40,
  className = "",
}: {
  mark?: LogoMark;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Logo mark={mark} size={size} />
      <span
        className="font-semibold tracking-tight"
        style={{ fontSize: size * 0.62, letterSpacing: "-0.02em" }}
      >
        Plate
      </span>
    </span>
  );
}
