/**
 * What running this app costs, per person, beyond the model.
 *
 * It is an **estimate**, and the caveat travels with the number the way it
 * does on `lib/burn.ts`. Token spend is measured — every response's usage
 * block goes into `usage_daily` and the figure is exact. Infrastructure is
 * not: the platform bills the deployment, not the account, and nothing here
 * meters a single person's function seconds or database reads. So this
 * apportions a known bill using the two things that are actually counted —
 * model requests, and days somebody used the app at all.
 *
 * The rates are named, in one place, and wrong by a factor of two rather than
 * ten. That is the honest claim: it is good enough to answer "is one person
 * costing me ten pence or ten pounds a month", which is the question, and not
 * good enough to reconcile against an invoice, which it never says it is.
 *
 * Everything is in micros — millionths of a dollar — because that is what the
 * spend ledger uses and mixing floats into money is how rounding becomes
 * revenue.
 */

/** A dollar, in micros. */
export const MICROS = 1_000_000;

/**
 * A coaching turn's share of compute.
 *
 * One turn is one serverless invocation that runs for most of a minute — the
 * loop waits on the model — at 2GB. Vercel bills about $0.18 per GB-hour on
 * the current plans, so 40s at 2GB is roughly 0.022 GB-hours, about 400
 * micros. Rounded up rather than down: an estimate that flatters the bill is
 * the useless direction.
 */
export const PER_REQUEST_MICROS = 450;

/**
 * A day somebody opened the app, whatever else they did.
 *
 * Every screen is `force-dynamic`, so a session is tens of short invocations
 * and as many database round trips. Measured against nothing — there is no
 * per-request log — so this is a deliberate flat charge for "a person used
 * the app today", and the number to revisit first if the total looks wrong.
 */
export const PER_ACTIVE_DAY_MICROS = 3_000;

/**
 * The bill that arrives whether anybody logs in or not, per month.
 *
 * Database, blob store and the platform's own floor. Split evenly across the
 * accounts that were active in the window, because an idle account costs
 * almost nothing and charging it a share would make three dormant invitees
 * look like a cost centre.
 */
export const FIXED_MONTHLY_MICROS = 0;

export type Window = "today" | "week" | "month" | "year";

/** Days each window covers, for apportioning the fixed monthly bill. */
export const WINDOW_DAYS: Record<Window, number> = {
  today: 1, week: 7, month: 30, year: 365,
};

export type Usage = {
  /** Model requests in the window — measured. */
  requests: number;
  /** Distinct days with any activity in the window — measured. */
  activeDays: number;
};

/**
 * The infrastructure share for one person over one window, in micros.
 *
 * `activeAccounts` is how many people to split the fixed bill between; zero or
 * fewer means nobody was active, and a division by that would be worse than
 * charging nothing.
 */
export function infraMicros(
  usage: Usage,
  window: Window,
  activeAccounts: number,
): number {
  const variable = usage.requests * PER_REQUEST_MICROS
    + usage.activeDays * PER_ACTIVE_DAY_MICROS;
  const fixedShare = activeAccounts > 0
    ? Math.round((FIXED_MONTHLY_MICROS / 30) * WINDOW_DAYS[window] / activeAccounts)
    : 0;
  return variable + fixedShare;
}

/** "$1.23", or "$0.004" where a cent would round it to nothing. */
export function money(micros: number): string {
  const dollars = micros / MICROS;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
