import Link from "next/link";

/**
 * A day at a time, and no doubt about which one you are on.
 *
 * Not decoration. Everything this app records is filed against *her* today, so
 * a screen showing Thursday while the buttons write to Wednesday is the most
 * confusing thing it could do — the rule is that the date is stated whenever
 * it is not today, in the same place, every time.
 *
 * One control rather than four scattered ones: the date sits between its own
 * arrows, and the way back is a labelled button that says where it goes,
 * because an unlabelled chevron and a bare word "Today" next to each other are
 * two things that look like the same thing and are not.
 */
export function DayNav({
  base, param, prev, next, today, label, isToday,
}: {
  base: string;
  param: string;
  prev: string;
  next: string;
  today: string;
  label: string;
  isToday: boolean;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div
        className={`flex flex-1 items-center overflow-hidden rounded-xl border ${
          isToday ? "border-line bg-surface" : "border-hold/50 bg-hold-soft"
        }`}
      >
        <Link
          href={`${base}?${param}=${prev}`}
          scroll={false}
          aria-label="The day before"
          className="grid size-10 shrink-0 place-items-center text-muted transition-colors hover:bg-raised"
        >
          <Chevron dir="left" />
        </Link>

        <p className={`min-w-0 flex-1 truncate px-2 text-center text-[14px] font-semibold ${
          isToday ? "text-text" : "text-hold"
        }`}>
          {label}
          {isToday && <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-accent">Today</span>}
        </p>

        <Link
          href={`${base}?${param}=${next}`}
          scroll={false}
          aria-label="The day after"
          className="grid size-10 shrink-0 place-items-center text-muted transition-colors hover:bg-raised"
        >
          <Chevron dir="right" />
        </Link>
      </div>

      {!isToday && (
        <Link
          href={`${base}?${param}=${today}`}
          scroll={false}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-[13px] font-semibold text-ink"
        >
          Today
          <Chevron dir="right" />
        </Link>
      )}
    </div>
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
