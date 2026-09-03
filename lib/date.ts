/**
 * All day-level dates are 'YYYY-MM-DD' strings in HER timezone, not the
 * server's. Vercel functions run in UTC, so without this a 7:30pm workout in
 * Mountain time would be recorded against the following day — every evening,
 * silently, from the first day of deployment.
 *
 * Only `today()` depends on a timezone. Every other function here is pure
 * string/UTC arithmetic, so it cannot drift with the server's locale or with
 * daylight saving.
 */
export type ISODate = string;

/** Her timezone. Set APP_TIMEZONE in the environment; UTC is the safe default. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "UTC";

const ISO_IN_ZONE = (tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });

export function toISODate(d: Date, tz: string = APP_TIMEZONE): ISODate {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  return ISO_IN_ZONE(tz).format(d);
}

export const today = (tz: string = APP_TIMEZONE): ISODate => toISODate(new Date(), tz);

/**
 * The hour of the day where she is, 0–23.
 *
 * Same rule as every date in this app: computed in her timezone, never the
 * server's. Greeting someone "good morning" at nine in the evening because
 * the box is in another country is the small, silly version of filing her
 * dinner on the wrong day.
 */
export function hourIn(tz: string = APP_TIMEZONE): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", hour12: false,
  }).format(new Date());
  // "24" is how some zones render midnight under hourCycle h24.
  return Number(h) % 24;
}

/**
 * What to call the time of day.
 *
 * The boundaries are the ordinary English ones rather than anything clever:
 * morning until noon, afternoon until six, evening until ten, and night after
 * that — which is also when someone still awake would rather be told it is
 * night than be wished a good evening.
 */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 22) return "Good evening";
  return "Good night";
}

/** Parse 'YYYY-MM-DD' as a UTC instant — no local-time interpretation. */
const parse = (date: ISODate): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const format = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: ISODate, days: number): ISODate =>
  format(parse(date) + days * 86_400_000);

export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((parse(b) - parse(a)) / 86_400_000);

/** Monday-anchored week start, matching how the weekly plan is generated. */
export function weekStart(date: ISODate = today()): ISODate {
  return addDays(date, -dayIndex(date));
}

export const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

/** 0=Monday … 6=Sunday, matching `planDays.dayOfWeek`. */
export function dayIndex(date: ISODate = today()): number {
  return (new Date(parse(date)).getUTCDay() + 6) % 7;
}

export function prettyDate(date: ISODate): string {
  // Formatted in UTC to match how the date was parsed; otherwise a date-only
  // value can render as the previous day west of Greenwich.
  return new Date(parse(date)).toLocaleDateString(undefined, {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
  });
}

/**
 * Dates arriving from a tool call are model-supplied and have been wrong: asked
 * to log "this morning", the coach once wrote a date a week in the future, and
 * the row was accepted silently. Anything that records something that already
 * happened should refuse a future date rather than store it.
 */
export const isFuture = (date: ISODate, asOf: ISODate = today()): boolean =>
  date > asOf;

export const FUTURE_DATE_ERROR =
  "That date is in the future. Log what has already happened, or omit the date to use today.";
