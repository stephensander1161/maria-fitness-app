import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sleepLogs } from "@/lib/db/schema";
import { addDays, daysBetween, weekStart, type ISODate } from "@/lib/date";

/**
 * Sleep, tracked and judged the way food is.
 *
 * It earns that treatment: short sleep moves appetite, grip strength, rate of
 * perceived exertion and injury risk enough that a training app silent about
 * it is missing one of the two or three things that actually explain a bad
 * week. The app used to have nothing to say about it at all, so a fortnight
 * of five-hour nights read as her losing motivation.
 *
 * Everything here obeys the house rule: **unknown is not zero.** A night with
 * no row is a night nobody wrote down, not a night she did not sleep. Averages
 * count logged nights only, and a window less than half logged refuses to
 * judge her sleep rather than reporting a number that reads as her failing.
 */

/** Eight hours. The middle of the adult range, and what she gets asked about. */
export const SLEEP_TARGET_DEFAULT_MIN = 480;

/**
 * Seven hours — the consensus floor for adults, not a preference.
 *
 * Below it is where the measured costs start, so it is the line the app warns
 * on. Her *target* can sit anywhere; this is the line under which the app
 * says something whatever her target is.
 */
export const SLEEP_SHORT_MIN = 420;

/** Under five hours is a different conversation from a slightly short night. */
export const SLEEP_VERY_SHORT_MIN = 300;

/** Sensible bounds on a typed figure. Sixteen hours is a hospital stay. */
export const SLEEP_MAX_MIN = 16 * 60;

/** A window is only worth averaging if this much of it was written down. */
export const SLEEP_LOGGED_SHARE = 0.5;
/** …and never on fewer nights than this, however short the window. */
export const SLEEP_MIN_NIGHTS = 3;

export type SleepNight = {
  date: ISODate;
  minutes: number;
  quality: number | null;
  bedAt: string | null;
  wakeAt: string | null;
  note: string | null;
};

/** What the app says about one night, against her own target. */
export type SleepState = "short" | "under" | "there" | "long" | "unknown";

export type SleepSummary = {
  /** Nights in the window that have a row. */
  logged: number;
  /** Nights the window covers. */
  nights: number;
  /** Mean over *logged* nights, or null when there are too few to mean anything. */
  meanMinutes: number | null;
  /** Logged nights under the seven-hour floor. */
  shortNights: number;
  /** Mean quality over the nights she rated, null if she rated none. */
  meanQuality: number | null;
  /** How much to trust the mean. `under-logged` means do not judge at all. */
  confidence: "good" | "thin" | "under-logged";
  /**
   * Total shortfall against target across logged nights, in minutes, floored
   * at zero. A long night does not pay back a short one — that is not how the
   * evidence reads — so surpluses are not netted off.
   */
  debtMinutes: number;
};

/** Her target, or the default. Minutes, always. */
export function sleepTarget(profile: { sleepTargetMinutes?: number | null }): number {
  const set = profile.sleepTargetMinutes;
  return set !== null && set !== undefined && set > 0 ? set : SLEEP_TARGET_DEFAULT_MIN;
}

/**
 * "7h 20m". Never a decimal: 7.33 hours is a number nobody sleeps in.
 */
export function formatSleep(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Parse what she typed. "7h30", "7.5", "450m", "7:30" all mean the same night.
 *
 * Returns null rather than a guess — the same refusal as a portion in a
 * measure the food is not sold in. A number the app invented for a night she
 * mistyped is worse than asking again.
 */
export function parseSleep(said: string): number | null {
  const t = said.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;

  const hm = /^(\d{1,2})[h:](\d{1,2})m?$/.exec(t);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    return m < 60 ? clampSleep(h * 60 + m) : null;
  }
  const hOnly = /^(\d{1,2}(?:\.\d+)?)h$/.exec(t);
  if (hOnly) return clampSleep(Math.round(Number(hOnly[1]) * 60));
  const mOnly = /^(\d{1,4})m(?:in(?:s|utes)?)?$/.exec(t);
  if (mOnly) return clampSleep(Number(mOnly[1]));

  const bare = /^(\d{1,4}(?:\.\d+)?)$/.exec(t);
  if (bare) {
    const n = Number(bare[1]);
    // A bare number is hours if it could be a night's sleep and minutes if it
    // plainly could not. Nobody means 8 minutes, and nobody means 450 hours.
    return clampSleep(n <= 16 ? Math.round(n * 60) : Math.round(n));
  }
  return null;
}

function clampSleep(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > SLEEP_MAX_MIN) return null;
  return minutes;
}

/**
 * How one night reads against her target.
 *
 * `short` is the seven-hour floor and is deliberately not the same thing as
 * `under`: a night below her eight-hour target is normal life, and a night
 * below seven is the one worth a sentence. Flattening the two makes the app
 * nag about a 7h45 night, which is how people turn a feature off.
 */
export function sleepState(minutes: number | null | undefined, target: number): SleepState {
  if (minutes === null || minutes === undefined) return "unknown";
  if (minutes < SLEEP_SHORT_MIN) return "short";
  if (minutes >= target + 90) return "long";
  if (minutes >= target - 20) return "there";
  return "under";
}

/**
 * Average a window without inventing the nights nobody wrote down.
 *
 * `nights` is the size of the window, not the number of rows: that difference
 * is the whole point. Ten rows out of fourteen is an average; three out of
 * fourteen is a rumour, and the summary says so instead of dividing by three
 * and reporting it in the same typeface as a real figure.
 */
export function summariseSleep(
  nights: readonly SleepNight[],
  target: number,
  windowNights: number,
): SleepSummary {
  const logged = nights.length;
  const span = Math.max(windowNights, logged);
  const enough = logged >= SLEEP_MIN_NIGHTS && logged >= span * SLEEP_LOGGED_SHARE;

  const rated = nights.filter((n) => n.quality !== null);
  const shortNights = nights.filter((n) => n.minutes < SLEEP_SHORT_MIN).length;
  const debtMinutes = nights.reduce((t, n) => t + Math.max(0, target - n.minutes), 0);

  return {
    logged,
    nights: span,
    meanMinutes: enough ? Math.round(nights.reduce((t, n) => t + n.minutes, 0) / logged) : null,
    shortNights,
    meanQuality: rated.length > 0
      ? Math.round((rated.reduce((t, n) => t + (n.quality ?? 0), 0) / rated.length) * 10) / 10
      : null,
    confidence: enough ? (logged >= span * 0.8 ? "good" : "thin") : "under-logged",
    debtMinutes,
  };
}

/**
 * The one sentence worth interrupting her with, or null.
 *
 * Null is the common case and has to stay the common case. A screen that says
 * something about sleep every single time she opens it is one she reads past,
 * and then the week it actually matters she reads past that too.
 */
export function sleepAlert(recent: SleepSummary, lastNight: number | null): string | null {
  if (lastNight !== null && lastNight < SLEEP_VERY_SHORT_MIN) {
    return `Under ${formatSleep(SLEEP_VERY_SHORT_MIN)} last night. Train if you want to, but treat today's numbers as information about your sleep, not your strength.`;
  }
  if (recent.confidence === "under-logged") return null;
  if (recent.shortNights >= 3 && recent.meanMinutes !== null && recent.meanMinutes < SLEEP_SHORT_MIN) {
    return `${recent.shortNights} short nights in the last ${recent.nights}, averaging ${formatSleep(recent.meanMinutes)}. That shows up as heavier sessions and a bigger appetite before it shows up as tiredness.`;
  }
  if (lastNight !== null && lastNight < SLEEP_SHORT_MIN) {
    return `${formatSleep(lastNight)} last night. Worth knowing before a heavy set feels harder than it should.`;
  }
  return null;
}

/* ------------------------------------------------------------------ reads */

const nightFrom = (r: typeof sleepLogs.$inferSelect): SleepNight => ({
  date: r.date,
  minutes: r.minutes,
  quality: r.quality,
  bedAt: r.bedAt,
  wakeAt: r.wakeAt,
  note: r.note,
});

/** One night, by the morning she woke. */
export async function sleepOn(profileId: string, date: ISODate): Promise<SleepNight | null> {
  const [row] = await db
    .select().from(sleepLogs)
    .where(and(eq(sleepLogs.profileId, profileId), eq(sleepLogs.date, date)))
    .limit(1);
  return row ? nightFrom(row) : null;
}

/** Every logged night in a closed range, newest first. */
export async function sleepBetween(
  profileId: string, from: ISODate, to: ISODate,
): Promise<SleepNight[]> {
  const rows = await db
    .select().from(sleepLogs)
    .where(and(
      eq(sleepLogs.profileId, profileId),
      gte(sleepLogs.date, from),
      lte(sleepLogs.date, to),
    ))
    .orderBy(desc(sleepLogs.date));
  return rows.map(nightFrom);
}

/** The most recent nights she has logged, newest first, however old. */
export async function recentSleep(profileId: string, limit = 14): Promise<SleepNight[]> {
  const rows = await db
    .select().from(sleepLogs)
    .where(eq(sleepLogs.profileId, profileId))
    .orderBy(desc(sleepLogs.date))
    .limit(limit);
  return rows.map(nightFrom);
}

export type SleepWindow = { meanMinutes: number | null; logged: number; nights: number; shortNights: number };
export type SleepTotals = {
  lastNight: SleepNight | null;
  week: SleepWindow;
  month: SleepWindow;
  year: SleepWindow;
};

/**
 * Sleep at the four horizons Progress reads at, in one pass over the table.
 *
 * Same shape and same reason as `trainingTotals`: four date ranges asked
 * separately is four round trips to say one thing. Every boundary comes off
 * *her* today — a month starting on the server's date starts a day early for
 * anybody west of it.
 */
export async function sleepTotals(profileId: string, asOf: ISODate): Promise<SleepTotals> {
  const week = weekStart(asOf);
  const month = `${asOf.slice(0, 7)}-01`;
  const year = `${asOf.slice(0, 4)}-01-01`;

  const mean = (from: string) =>
    sql<number | null>`avg(case when ${sleepLogs.date} >= ${from} then ${sleepLogs.minutes} end)`;
  const counted = (from: string) =>
    sql<number>`count(*) filter (where ${sleepLogs.date} >= ${from})::int`;
  const short = (from: string) =>
    sql<number>`count(*) filter (where ${sleepLogs.date} >= ${from} and ${sleepLogs.minutes} < ${SLEEP_SHORT_MIN})::int`;

  const [agg] = await db
    .select({
      weekMean: mean(week), weekLogged: counted(week), weekShort: short(week),
      monthMean: mean(month), monthLogged: counted(month), monthShort: short(month),
      yearMean: mean(year), yearLogged: counted(year), yearShort: short(year),
    })
    .from(sleepLogs)
    .where(and(eq(sleepLogs.profileId, profileId), gte(sleepLogs.date, year), lte(sleepLogs.date, asOf)));

  // Nights *elapsed*, not nights in the calendar period: a month is four days
  // old on the 4th, and dividing by 31 would report her as barely logging.
  const span = (from: ISODate) => daysBetween(from, asOf) + 1;

  const windowOf = (
    meanRaw: number | null | undefined, logged: number | undefined,
    shortNights: number | undefined, nights: number,
  ): SleepWindow => {
    const count = logged ?? 0;
    const enough = count >= SLEEP_MIN_NIGHTS && count >= nights * SLEEP_LOGGED_SHARE;
    return {
      // Refused rather than reported when too little of the window is written
      // down — the mean of two nights is not "how she is sleeping this month".
      meanMinutes: enough && meanRaw !== null && meanRaw !== undefined ? Math.round(Number(meanRaw)) : null,
      logged: count,
      nights,
      shortNights: shortNights ?? 0,
    };
  };

  return {
    // Her today *is* the morning she last woke, by the filing rule above.
    lastNight: await sleepOn(profileId, asOf),
    week: windowOf(agg?.weekMean, agg?.weekLogged, agg?.weekShort, span(week)),
    month: windowOf(agg?.monthMean, agg?.monthLogged, agg?.monthShort, span(month)),
    year: windowOf(agg?.yearMean, agg?.yearLogged, agg?.yearShort, span(year)),
  };
}

/**
 * The sleep line for the volatile state block, or null.
 *
 * The block is the most effective way to fix a wrong answer in this app and
 * the most dangerous, because the model believes it completely. So it says
 * exactly what is known and exactly what is not: how many nights are logged
 * alongside the average, never an average on its own. A model handed "she
 * slept 5h" for a fortnight she logged twice will tell her she is running
 * herself into the ground, and it will be wrong.
 *
 * Null when there is nothing worth the tokens — which is most days, and has
 * to be, or the block grows a paragraph nothing reads.
 */
export async function sleepSignal(profileId: string, asOf: ISODate, target: number): Promise<string | null> {
  const from = addDays(asOf, -13);
  const nights = await sleepBetween(profileId, from, asOf);
  if (nights.length === 0) return null;

  const summary = summariseSleep(nights, target, 14);
  const lastNight = nights.find((n) => n.date === asOf) ?? null;
  const parts: string[] = [];

  if (lastNight) {
    parts.push(`Last night she slept ${formatSleep(lastNight.minutes)}${
      lastNight.quality !== null ? ` and rated it ${lastNight.quality}/5` : ""
    } (her target is ${formatSleep(target)}).`);
  } else {
    parts.push(`She has not logged last night's sleep. That means nobody wrote it down, not that she slept badly — ask rather than assume.`);
  }

  if (summary.confidence === "under-logged") {
    parts.push(`Only ${summary.logged} of the last 14 nights are logged, which is too few to average. Do not tell her how she has been sleeping.`);
  } else {
    parts.push(`Over the last 14 nights she logged ${summary.logged} of them, averaging ${formatSleep(summary.meanMinutes)}, with ${summary.shortNights} under ${formatSleep(SLEEP_SHORT_MIN)}.`);
  }

  const alert = sleepAlert(summary, lastNight?.minutes ?? null);
  if (alert) {
    parts.push(`Worth raising if training or appetite comes up: ${alert} Never tell her off for it — nobody chooses a short night.`);
  }
  return parts.join(" ");
}
