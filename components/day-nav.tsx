import Link from "next/link";

/**
 * A day at a time, and no doubt about which one you are on.
 *
 * The banner is not decoration. Everything this app records is filed against
 * *her* today, so a screen showing Thursday while the buttons write to
 * Wednesday is the single most confusing thing it could do — the rule is that
 * the date is stated whenever it is not today, in the same place, every time.
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
      <Link
        href={`${base}?${param}=${prev}`}
        scroll={false}
        aria-label="The day before"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-edge text-muted transition-colors hover:bg-raised"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>

      <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-center ${
        isToday ? "border-transparent" : "border-hold/50 bg-hold-soft"
      }`}>
        <p className={`truncate text-[13px] font-medium ${isToday ? "text-faint" : "text-hold"}`}>
          {isToday ? "Today" : label}
        </p>
        {!isToday && (
          <p className="text-[11px] text-hold/80">Not today — anything you log still lands on today</p>
        )}
      </div>

      <Link
        href={`${base}?${param}=${next}`}
        scroll={false}
        aria-label="The day after"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-edge text-muted transition-colors hover:bg-raised"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>

      {!isToday && (
        <Link
          href={`${base}?${param}=${today}`}
          scroll={false}
          className="shrink-0 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-ink"
        >
          Today
        </Link>
      )}
    </div>
  );
}
