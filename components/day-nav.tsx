import Link from "next/link";

/**
 * The day on screen, with a way either side of it.
 *
 * An earlier version turned the whole strip amber when the day was not today,
 * which read as a warning about something being wrong — it is not; looking at
 * Thursday is a perfectly ordinary thing to do. The date itself is the signal:
 * "Today" when it is, the day and date when it is not.
 *
 * The way back points where today actually is — forward when she is reading a
 * past session, backward when she is arranging a future one — and sits on that
 * side of the date. An arrow that points the wrong way is worse than no arrow.
 *
 * It still matters that she knows: everything logged from these cards is filed
 * against the day on screen, which is why the day is stated rather than
 * implied.
 */
export function DayNav({
  base, param, date, prev, next, today, label, isToday, actions, children,
}: {
  base: string;
  param: string;
  /** The day on screen, as YYYY-MM-DD. */
  date: string;
  prev: string;
  next: string;
  today: string;
  label: string;
  isToday: boolean;
  /** Pinned to the right of the date row — the coach buttons, in practice. */
  actions?: React.ReactNode;
  /** The day's own heading, centred under the date it belongs to. */
  children?: React.ReactNode;
}) {
  // Compared as dates, not as the words on the button. This read
  // `label < today` — "Wed, Sep 3" against "2026-09-03" — which is a string
  // comparison between two unrelated formats and was false every time, so the
  // way back sat on the left even when today was to the right.
  const behind = !isToday && date < today; // reading the past; today is ahead
  const jump = (
    <Link
      href={`${base}?${param}=${today}`}
      scroll={false}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft"
    >
      {!behind && <Chevron dir="left" />}
      Today
      {behind && <Chevron dir="right" />}
    </Link>
  );

  return (
    <header className="mb-5">
      {/*
        The date is centred on the row and stays there.
        Laid out in flow, the "Today" link appeared on one day and not the
        next, so the date shifted sideways as she stepped through the week —
        the one element that should be the fixed point of this control was
        the only one moving.
      */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link
            href={`${base}?${param}=${prev}`}
            scroll={false}
            aria-label="The day before"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted"
          >
            <Chevron dir="left" />
          </Link>
          {!isToday && !behind && jump}
        </div>

        <p
          className={`pointer-events-none absolute left-1/2 max-w-[46%] -translate-x-1/2 truncate text-center text-[13px] font-medium ${
            isToday ? "text-faint" : "text-text"
          }`}
        >
          {isToday ? "Today" : label}
        </p>

        <div className="flex items-center gap-1">
          {!isToday && behind && jump}
          <Link
            href={`${base}?${param}=${next}`}
            scroll={false}
            aria-label="The day after"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted"
          >
            <Chevron dir="right" />
          </Link>
          {actions && <div className="ml-1 shrink-0">{actions}</div>}
        </div>
      </div>

      {/* The day's heading under the day it belongs to, centred on it. Two
          separate blocks — a date strip and then a left-aligned title — were
          two headers for one screen. */}
      {children && <div className="mt-1 text-center">{children}</div>}
    </header>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
