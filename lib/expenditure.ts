/**
 * What she actually burns, measured rather than predicted.
 *
 * Mifflin-St Jeor was wrong on day one — it is a population regression, not
 * her — and it gets wronger as she loses weight and adaptive thermogenesis
 * sets in. A formula that stays fixed while her body changes is the most
 * likely source of "I'm doing everything right and nothing is happening",
 * which is the sentence this whole app is built to prevent.
 *
 * The arithmetic is the energy balance identity and nothing cleverer:
 *
 *     TDEE ≈ mean daily intake − (change in trend weight × 7700 kcal/kg) / days
 *
 * The weight side is a least-squares slope through her weigh-ins, not the
 * difference between two of them: endpoint-to-endpoint on raw weight is a
 * coin flip on water, and endpoint-to-endpoint on the *trend* under-reads a
 * real change, because a moving average lags by design. A regression over a
 * fortnight of readings uses all of them and is unbiased. Counted days only
 * on the intake side, or a week of meals logged in words reads as starvation.
 *
 * ── The rails, which matter more than the estimate ──
 *
 * 1. **Under-logging can never lower her target.** Fewer than half the window
 *    fully counted, or fewer than seven days, and this refuses to estimate at
 *    all. Otherwise a bad logging week silently ratchets the deficit down —
 *    the "unknown is not zero" bug wearing a nutrition-science costume.
 * 2. **A floor she cannot be talked below.** Never under her BMR, never under
 *    CALORIE_FLOOR, whatever the arithmetic says and whatever she asks for.
 * 3. **A capped rate of loss.** ~0.75% of body weight per week, the same
 *    bound the starting targets use.
 * 4. **Smoothed.** The estimate moves toward the measurement rather than
 *    jumping to it, so one heavy week does not whip her target around.
 */

import { CALORIE_FLOOR, type GoalDirection } from "./nutrition";
import { weightTrend, type WeighIn } from "./trend";
import type { ISODate } from "./date";

/** kcal in a kilogram of body mass, near enough for a fortnight's arithmetic. */
export const KCAL_PER_KG = 7700;

/**
 * Least-squares slope through weigh-ins, in kg per day.
 *
 * Uses every reading rather than the two on the ends, so one bloated morning
 * moves it by a fraction instead of by everything. Returns null below three
 * points or when they are all on one day.
 */
export function slopeKgPerDay(points: { date: ISODate; weightKg: number }[]): number | null {
  if (points.length < 3) return null;
  const t0 = Date.parse(`${points[0].date}T00:00:00Z`);
  const xs = points.map((p) => (Date.parse(`${p.date}T00:00:00Z`) - t0) / 86_400_000);
  const ys = points.map((p) => p.weightKg);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const varX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  if (varX === 0) return null;
  const cov = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  return cov / varX;
}

export type IntakeDay = {
  date: ISODate;
  /** Sum of the entries that carried figures. */
  calories: number | null;
  /** True only when every entry that day carried figures. */
  caloriesComplete: boolean;
};

export type Expenditure = {
  /** Measured kcal/day, or null when the data cannot support one. */
  tdee: number | null;
  /** How many days of the window were fully counted. */
  daysCounted: number;
  windowDays: number;
  meanIntake: number | null;
  weightChangeKg: number | null;
  confidence: "high" | "low" | "none";
  /** Said out loud when there is no estimate — never a silent fallback. */
  why: string;
};

/**
 * Her expenditure over a window, or an honest refusal.
 *
 * `previous` lets the estimate be smoothed against the last one: a 30% step
 * toward the new measurement, which is enough to follow a real change within a
 * few weeks and not enough to chase a noisy fortnight.
 */
export function estimateExpenditure(
  days: IntakeDay[],
  weighIns: WeighIn[],
  asOf: ISODate,
  previous?: number | null,
): Expenditure {
  const windowDays = days.length;
  const counted = days.filter((d) => d.caloriesComplete && d.calories !== null);
  const daysCounted = counted.length;

  const refuse = (why: string): Expenditure => ({
    tdee: null, daysCounted, windowDays,
    meanIntake: daysCounted ? Math.round(counted.reduce((n, d) => n + d.calories!, 0) / daysCounted) : null,
    weightChangeKg: null, confidence: daysCounted === 0 ? "none" : "low", why,
  });

  if (daysCounted < 7 || daysCounted < windowDays / 2) {
    // Deliberately before anything else: an estimate built on four counted
    // days would lower her target because she was busy, not because she ate
    // less.
    return refuse(
      // Second person: this string is rendered on the check-in card, not fed
      // to the model. Tool descriptions talk *about* her; anything she reads
      // talks *to* her.
      `Only ${daysCounted} of the last ${windowDays} days are fully counted — not enough to measure what you burn. Nothing changes until there are more.`,
    );
  }

  const trend = weightTrend(weighIns, asOf);
  if (trend.confidence !== "high" || trend.series.length < 2) {
    return refuse(
      `Not enough recent weigh-ins to see a trend — ${trend.weighInsLast14Days} in the last fortnight. Weight has to be measured before expenditure can be.`,
    );
  }

  // Over the same span the intake covers, so the two sides describe the same
  // fortnight.
  const from = days[0].date;
  const within = weighIns.filter((w) => w.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  const slope = slopeKgPerDay(within);
  if (within.length < 3 || slope === null) {
    return refuse("The weigh-ins do not span the same days as the food log, so the two cannot be compared.");
  }

  const spanDays = Math.max(
    1,
    Math.round((Date.parse(`${within[within.length - 1].date}T00:00:00Z`) - Date.parse(`${within[0].date}T00:00:00Z`)) / 86_400_000),
  );
  const weightChangeKg = Math.round(slope * spanDays * 100) / 100;
  const meanIntake = Math.round(counted.reduce((n, d) => n + d.calories!, 0) / daysCounted);

  const measured = meanIntake - slope * KCAL_PER_KG;

  // Smoothed toward the measurement. MacroFactor's published behaviour is the
  // same shape and for the same reason: expenditure is noisy, and a target
  // that lurches weekly is one she stops trusting.
  const tdee = Math.round(
    previous && previous > 0 ? previous + 0.3 * (measured - previous) : measured,
  );

  // A measurement this far from plausible is a data problem, not a metabolism.
  // Generous at both ends and still nowhere near what a typo produces: 1200
  // kcal against 6kg in a fortnight implies burning 4,750 a day.
  if (tdee < 900 || tdee > 4000) {
    return refuse(
      `The numbers do not add up — ${meanIntake} kcal a day against ${weightChangeKg}kg over ${spanDays} days implies ${Math.round(measured)} kcal burned, which is not a person. Something is mis-logged.`,
    );
  }

  return {
    tdee, daysCounted, windowDays, meanIntake, weightChangeKg,
    confidence: "high",
    why: `${daysCounted} counted days at ${meanIntake} kcal, trend weight ${weightChangeKg >= 0 ? "+" : ""}${weightChangeKg}kg over ${spanDays} days.`,
  };
}

export type TargetProposal = {
  calorieTarget: number;
  /** What the arithmetic wanted, before the floors. */
  uncapped: number;
  /** Set when a rail moved the number, so it can be said out loud. */
  limitedBy: "bmr" | "floor" | "rate" | null;
  /**
   * How fast, per week, as a magnitude — never signed. Callers render it
   * straight ("0.5kg a week"), so a minus sign here would leak into her
   * screen; `direction` is what says which way it goes.
   */
  rateKgPerWeek: number;
  direction: GoalDirection;
  note: string;
};

/**
 * A target from a measured expenditure, with every rail applied.
 *
 * `bmr` is the hard floor: never prescribe below what she burns lying still.
 * Sustained low energy availability costs bone density and menstrual function,
 * and no rate of loss is worth that — so the coach cannot be talked below it
 * either, because the number never leaves this function.
 */
export function proposeTarget(
  tdee: number,
  weightKg: number,
  bmr: number,
  opts: { rateKgPerWeek?: number; direction?: GoalDirection } = {},
): TargetProposal {
  const direction = opts.direction ?? "lose";

  // Holding is the whole proposal: eat what she burns, and let training change
  // the composition. Nothing to cap, and nothing to talk her below.
  if (direction === "hold") {
    const held = Math.round(Math.max(tdee, CALORIE_FLOOR, bmr) / 10) * 10;
    return {
      calorieTarget: held,
      uncapped: Math.round(tdee / 10) * 10,
      limitedBy: null,
      rateKgPerWeek: 0,
      direction,
      note: "About what you burn — steady weight, while training changes what it is made of.",
    };
  }

  /**
   * The cap is not symmetric, and that is deliberate.
   *
   * Fat comes off about as fast as the deficit allows. Muscle goes on at a
   * rate the body sets, and eating past it adds fat rather than speeding
   * anything up — so the gain cap is a third of the loss cap. Someone asking
   * to bulk faster is asking to bulk fatter, and the honest answer is to say
   * so rather than to hand over the number.
   */
  const maxRate = direction === "gain"
    ? Math.round(weightKg * 0.0025 * 100) / 100
    : Math.round(weightKg * 0.0075 * 100) / 100;
  const rate = Math.min(Math.abs(opts.rateKgPerWeek ?? maxRate), maxRate);
  const perDay = (rate * KCAL_PER_KG) / 7;

  const uncapped = Math.round((direction === "gain" ? tdee + perDay : tdee - perDay) / 10) * 10;
  const bmrFloor = Math.round(bmr);
  const floor = Math.max(CALORIE_FLOOR, bmrFloor);

  let calorieTarget = uncapped;
  let limitedBy: TargetProposal["limitedBy"] = null;
  if (opts.rateKgPerWeek !== undefined && Math.abs(opts.rateKgPerWeek) > maxRate) limitedBy = "rate";
  if (calorieTarget < floor) {
    calorieTarget = Math.round(floor / 10) * 10;
    limitedBy = bmrFloor > CALORIE_FLOOR ? "bmr" : "floor";
  }

  // A magnitude either way: the sense lives in `direction` and in the note.
  const actualRate = Math.abs(
    Math.round(((calorieTarget - tdee) * 7 / KCAL_PER_KG) * 100) / 100,
  );
  const gaining = direction === "gain";
  return {
    calorieTarget,
    uncapped,
    limitedBy,
    rateKgPerWeek: actualRate,
    direction,
    note:
      limitedBy === "bmr"
        ? "Held at what you burn at rest — going under that costs muscle, bone and your cycle, and no rate of loss is worth it."
        : limitedBy === "floor"
          ? "Held at the floor this app will not go below."
          : limitedBy === "rate"
            ? gaining
              ? `Capped at ${maxRate}kg a week — faster than that is mostly fat, not muscle.`
              : `Capped at ${maxRate}kg a week — faster than that is mostly muscle and water.`
            : gaining
              ? `About ${actualRate}kg a week on.`
              : `About ${actualRate}kg a week off.`,
  };
}
