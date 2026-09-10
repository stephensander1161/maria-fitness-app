import Link from "next/link";

/**
 * The way to another day, and the way back to today.
 *
 * These used to be a strip of their own above the session: two arrows, a date
 * and the coach's buttons, in a header that said one word. The card below it
 * already carried the day's name and the Start button, so the screen opened on
 * two containers saying one thing. The pieces are exported separately now and
 * the card places them itself — arrow, name, arrow, control, one row.
 *
 * An earlier version turned the whole strip amber when the day was not today,
 * which read as a warning about something being wrong — it is not; looking at
 * Thursday is a perfectly ordinary thing to do. The date itself is the signal:
 * "Today" when it is, the day and date when it is not.
 *
 * The way back points where today actually is — forward when she is reading a
 * past session, backward when she is arranging a future one. An arrow that
 * points the wrong way is worse than no arrow.
 *
 * It still matters that she knows which day she is on: everything logged from
 * these cards is filed against the day on screen, which is why the day is
 * stated rather than implied.
 */
export function DayStep({
  href, dir, label,
}: { href: string; dir: "left" | "right"; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted"
    >
      <Chevron dir={dir} />
    </Link>
  );
}

/**
 * "Today", or the day she is looking at with the way back to today beside it.
 *
 * Sits under the day's name inside the card, small: the name of the session is
 * what she came for and the date is what stops her filing Tuesday's sets
 * against Wednesday.
 */
export function DayLabel({
  base, param, date, today, label, isToday,
}: {
  base: string; param: string;
  /** The day on screen, as YYYY-MM-DD. */
  date: string;
  today: string;
  label: string;
  isToday: boolean;
}) {
  // Compared as dates, not as the words on the button. This read
  // `label < today` — "Wed, Sep 3" against "2026-09-03" — which is a string
  // comparison between two unrelated formats and was false every time, so the
  // way back sat on the left even when today was to the right.
  const behind = !isToday && date < today; // reading the past; today is ahead

  return (
    <p className={`flex min-w-0 items-center justify-center gap-1 text-[12px] font-medium ${
      isToday ? "text-faint" : "text-text"
    }`}>
      <span className="truncate">{isToday ? "Today" : label}</span>
      {!isToday && (
        <Link
          href={`${base}?${param}=${today}`}
          scroll={false}
          className="flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft"
        >
          {!behind && <Chevron dir="left" small />}
          Today
          {behind && <Chevron dir="right" small />}
        </Link>
      )}
    </p>
  );
}

function Chevron({ dir, small = false }: { dir: "left" | "right"; small?: boolean }) {
  const n = small ? 13 : 16;
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
