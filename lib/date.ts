/**
 * All day-level dates are 'YYYY-MM-DD' strings in the user's local timezone.
 * Storing a plain date (not a timestamp) avoids the classic "workout logged on
 * the wrong day because UTC rolled over" bug.
 */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const today = (): ISODate => toISODate(new Date());

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) /
      86_400_000,
  );

/** Monday-anchored week start, matching how the weekly plan is generated. */
export function weekStart(date: ISODate = today()): ISODate {
  const d = new Date(`${date}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -dow);
}

export const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

/** 0=Monday … 6=Sunday, matching `planDays.dayOfWeek`. */
export function dayIndex(date: ISODate = today()): number {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
}

export function prettyDate(date: ISODate): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

/**
 * Dates arriving from a tool call are model-supplied and have been wrong: asked
 * to log "this morning", the coach once wrote a date a week in the future, and
 * the row was accepted silently. Anything that records something that already
 * happened should refuse a future date rather than store it.
 */
export const isFuture = (date: ISODate): boolean => date > today();

export const FUTURE_DATE_ERROR =
  "That date is in the future. Log what has already happened, or omit the date to use today.";
