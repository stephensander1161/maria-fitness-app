import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { mealLogs, profiles } from "@/lib/db/schema";
import { nutritionTargets } from "@/lib/nutrition";
import { estimateExpenditure, type IntakeDay } from "@/lib/expenditure";
import { weighIns } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/**
 * What she ate minus what she burned, over a span of days.
 *
 * Two halves, and the honest handling of each matters more than the number.
 *
 * **Intake** counts only days where every entry carried a calorie figure. A
 * meal logged as "dinner at Mum's" has no number, and averaging it in as zero
 * is the bug this app has been bitten by most — it invents a deficit she
 * never ran and then congratulates her for it.
 *
 * **Expenditure** prefers the measured figure — intake against her own weight
 * slope, see lib/expenditure.ts — and falls back to the Mifflin-St Jeor
 * estimate only when there is not enough logged to measure. The formula is a
 * population regression and was wrong for her on day one, so it is the last
 * resort rather than the default.
 *
 * Returns `complete: false` rather than a smaller number when any day in the
 * span is missing figures. A partial total is not a smaller deficit; it is an
 * unknown one.
 *
 * And a day whose entries all carry figures can still be a day she stopped
 * logging after breakfast — every entry counted, most of the food missing.
 * Probed against a real account this produced a 1928 kcal deficit for a
 * single day, which is not a deficit anyone runs; it is porridge and then
 * nothing. See MIN_PLAUSIBLE_DAY_KCAL.
 */

/**
 * Below this, a day is far likelier to be under-logged than genuinely eaten.
 *
 * Deliberately low — someone ill, or fasting deliberately, does eat this
 * little, and the cost of the two mistakes is not symmetric. Refusing to
 * explain a real day loses a paragraph; explaining an imaginary 1900 kcal
 * deficit tells her she is doing something she is not, which is the exact
 * failure `caloriesComplete` was introduced to prevent one layer down.
 */
export const MIN_PLAUSIBLE_DAY_KCAL = 800;
export type EnergyBalance = {
  /** Negative is a deficit. Kcal across the whole span, not per day. */
  balanceKcal: number;
  /** Whether every day in the span was fully counted. */
  complete: boolean;
  days: number;
  /** Where the burn figure came from, so a caller can say. */
  burnSource: "measured" | "formula";
};

export async function energyBalanceBetween(
  profileId: string,
  after: ISODate,
  through: ISODate,
): Promise<EnergyBalance | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) return null;

  // The days strictly after her last weigh-in, up to and including this one:
  // the span the scale actually moved across.
  const logs = await db
    .select({ date: mealLogs.date, calories: mealLogs.calories })
    .from(mealLogs)
    .where(and(
      eq(mealLogs.profileId, profileId),
      gt(mealLogs.date, after),
      lte(mealLogs.date, through),
    ));

  const byDay = new Map<string, { total: number; complete: boolean }>();
  for (const row of logs) {
    const day = byDay.get(row.date) ?? { total: 0, complete: true };
    if (row.calories === null) day.complete = false;
    else day.total += row.calories;
    byDay.set(row.date, day);
  }

  const days = countDays(after, through);
  // Every day of the span has to be there, each of them fully counted, and
  // each of them plausible. "Every entry carried a figure" is satisfied by a
  // day with one entry on it.
  const complete = byDay.size === days
    && [...byDay.values()].every((d) => d.complete && d.total >= MIN_PLAUSIBLE_DAY_KCAL);
  if (!complete || days === 0) {
    return { balanceKcal: 0, complete: false, days, burnSource: "formula" };
  }

  const eaten = [...byDay.values()].reduce((n, d) => n + d.total, 0);

  // Her burn comes from a proper window, not from this span. Estimating a
  // day's expenditure from a single day between weigh-ins is not something
  // the maths supports — lib/expenditure.ts refuses under seven counted days
  // for exactly that reason — so the rate is measured over three weeks and
  // then applied to however many days the scale moved across.
  const measured = await measuredBurn(profileId, through);
  const burnPerDay = measured ?? fallbackBurn(profile);

  return {
    balanceKcal: Math.round(eaten - burnPerDay * days),
    complete: true,
    days,
    burnSource: measured === null ? "formula" : "measured",
  };
}

/**
 * What she actually burns, measured over three weeks, or null.
 *
 * Null is a real answer: under seven counted days lib/expenditure.ts refuses
 * rather than guessing, and this passes that refusal along rather than
 * quietly substituting the formula without saying so.
 */
async function measuredBurn(profileId: string, asOf: ISODate): Promise<number | null> {
  const from = shiftDays(asOf, -20);
  const [logs, history] = await Promise.all([
    db.select({ date: mealLogs.date, calories: mealLogs.calories })
      .from(mealLogs)
      .where(and(
        eq(mealLogs.profileId, profileId),
        gt(mealLogs.date, shiftDays(from, -1)),
        lte(mealLogs.date, asOf),
      )),
    db.select({ date: weighIns.date, weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, profileId)),
  ]);

  const byDay = new Map<string, { total: number; complete: boolean }>();
  for (const row of logs) {
    const day = byDay.get(row.date) ?? { total: 0, complete: true };
    if (row.calories === null) day.complete = false;
    else day.total += row.calories;
    byDay.set(row.date, day);
  }

  // Every day of the window, including the ones with nothing logged — a day
  // with no meals is not a zero-calorie day, and estimateExpenditure needs to
  // see it as uncounted rather than not see it at all.
  const window: IntakeDay[] = [];
  for (let i = 20; i >= 0; i -= 1) {
    const date = shiftDays(asOf, -i);
    const day = byDay.get(date);
    window.push({
      date,
      calories: day ? day.total : null,
      caloriesComplete: day ? day.complete : false,
    });
  }

  return estimateExpenditure(window, history, asOf).tdee;
}

const shiftDays = (date: ISODate, by: number): ISODate =>
  new Date(Date.parse(`${date}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10) as ISODate;

/** Mifflin-St Jeor, and only when there is nothing better. */
function fallbackBurn(profile: {
  startWeightKg: number | null; heightCm: number | null; birthYear: number | null;
  sex: "female" | "male" | "other" | null; daysPerWeek: number | null; units: "imperial" | "metric";
}): number {
  const targets = nutritionTargets({
    weightKg: profile.startWeightKg ?? 70,
    heightIn: (profile.heightCm ?? 168) / 2.54,
    age: profile.birthYear === null ? 35 : new Date().getUTCFullYear() - profile.birthYear,
    sex: profile.sex ?? "female",
    daysPerWeek: profile.daysPerWeek ?? 3,
    units: profile.units,
  });
  return targets.maintenanceCalories;
}

const countDays = (after: ISODate, through: ISODate) =>
  Math.round(
    (Date.parse(`${through}T00:00:00Z`) - Date.parse(`${after}T00:00:00Z`)) / 86_400_000,
  );
