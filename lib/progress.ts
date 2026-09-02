import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, goals, mealLogs, mealPlans, measurements, planDays, plans, profiles, setLogs, weighIns, workouts,
} from "@/lib/db/schema";
import { addDays, daysBetween, type ISODate, today, toISODate, weekStart } from "@/lib/date";
import { kgToLb, lengthLabel, lengthOut, weightLabel, weightOut, type Units } from "@/lib/units";
import { SITES } from "@/lib/measurements";
import { trendSeries, weightTrend } from "@/lib/trend";

/** Epley estimated one-rep max — the fairest single number for comparing
 *  3×10@40 against 4×6@50. Bodyweight sets fall back to total reps. */
export function e1rm(weightKg: number | null, reps: number): number {
  if (weightKg === null || weightKg === 0) return reps;
  return weightKg * (1 + reps / 30);
}

export type SetSummary = { setNumber: number; reps: number; weightKg: number | null; rpe: number | null };

export type Performance = {
  date: ISODate;
  sets: SetSummary[];
  totalReps: number;
  volumeKg: number;
  bestE1rm: number;
  bestSet: SetSummary | null;
};

/** Aggregate one day's sets into the numbers every comparison is built on. */
export function summarise(date: ISODate, rows: SetSummary[]): Performance {
  const totalReps = rows.reduce((n, s) => n + s.reps, 0);
  const volumeKg = rows.reduce((n, s) => n + (s.weightKg ?? 0) * s.reps, 0);
  let bestSet: SetSummary | null = null;
  let bestE1rm = 0;
  for (const s of rows) {
    const v = e1rm(s.weightKg, s.reps);
    if (v > bestE1rm) { bestE1rm = v; bestSet = s; }
  }
  return { date, sets: rows, totalReps, volumeKg, bestE1rm, bestSet };
}

/** Every past performance of one exercise, newest first, grouped by workout day. */
export async function exerciseHistory(
  profileId: string,
  exerciseId: string,
  limit = 8,
): Promise<Performance[]> {
  // Two queries rather than one: find the dates first, then fetch only those
  // sessions' sets. Pulling every set she has ever logged for a movement and
  // slicing in JavaScript is fine at twenty sessions and wasteful at a year's
  // worth — and a single LIMIT cannot be used, because a session is many rows.
  const dates = await db
    .selectDistinct({ date: workouts.date })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(desc(workouts.date))
    .limit(limit);

  if (dates.length === 0) return [];

  const rows = await db
    .select({
      date: workouts.date,
      setNumber: setLogs.setNumber,
      reps: setLogs.reps,
      weightKg: setLogs.weightKg,
      rpe: setLogs.rpe,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(
      eq(workouts.profileId, profileId),
      eq(setLogs.exerciseId, exerciseId),
      inArray(workouts.date, dates.map((d) => d.date)),
    ))
    .orderBy(desc(workouts.date), setLogs.setNumber);

  const byDate = new Map<ISODate, SetSummary[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  return [...byDate.entries()].map(([date, sets]) => summarise(date, sets));
}

export type Comparison = {
  exerciseId: string;
  exerciseName: string;
  previous: Performance | null;
  current: Performance | null;
  /** 'first' when there's nothing to compare against yet. */
  status: "first" | "beat" | "matched" | "missed";
  /** Percentage change in best-set estimated 1RM vs the previous session. */
  e1rmDeltaPct: number | null;
  volumeDeltaPct: number | null;
  /** One honest sentence, ready to render or hand to the coach. */
  headline: string;
};

function pct(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / before) * 100;
}

/** The short human rendering of one session's sets: `3×10 @ 88lb`, or a
 *  per-set list when the sets weren't uniform. */
export function describe(
  sets: Pick<SetSummary, "reps" | "weightKg">[],
  units: Units,
): string {
  if (sets.length === 0) return "nothing logged";
  const unit = weightLabel(units);
  // Round once, from the raw conversion: weightOut rounds to 0.1 first, and
  // rounding that again turns 220.46 lb into 221.
  const show = (kg: number) => Math.round(units === "imperial" ? kgToLb(kg) : kg);

  const w = sets[0].weightKg;
  const sameWeight = sets.every((s) => s.weightKg === w);
  const sameReps = sets.every((s) => s.reps === sets[0].reps);
  if (sameWeight && sameReps) {
    return `${sets.length}×${sets[0].reps}${w === null ? "" : ` @ ${show(w)}${unit}`}`;
  }
  return sets
    .map((s) => `${s.reps}${s.weightKg === null ? "" : `@${show(s.weightKg)}`}`)
    .join(", ");
}

/**
 * The verdict, with no database in the way: did this session beat, match, or
 * fall short of the one before it? Pure so it can be tested exhaustively — the
 * classification is the app's core promise, so it must not depend on I/O.
 *
 * A 2% band absorbs rounding on plate jumps so a genuine repeat reads as
 * "matched"; more total reps also counts as beating it.
 */
/** Rounding on plate jumps shouldn't read as a real change. */
const BAND = 0.02;
/** A double-digit drop in top-end strength is real, not noise. */
const INTENSITY_COLLAPSE = 0.10;
/**
 * Volume needs a far looser threshold than intensity. Moving from 3×10 to 3×8
 * at a heavier weight is a normal rep-scheme change that drops volume ~16%, and
 * calling that a failure would be a lie in the other direction. A third of the
 * work vanishing is a different thing entirely.
 */
const VOLUME_COLLAPSE = 0.35;

const rose = (now: number, before: number) => before > 0 && now > before * (1 + BAND);
const fell = (now: number, before: number) => before > 0 && now < before * (1 - BAND);
const droppedBy = (now: number, before: number, threshold: number) =>
  before > 0 && now < before * (1 - threshold);

/**
 * Compare two sessions on BOTH axes — intensity (best-set estimated 1RM) and
 * work done (volume, or total reps when there's no load).
 *
 * Judging on one axis alone lies in both directions: rating by reps calls a
 * 100kg×5 session that became 10×3 at 20kg a win, and rating by top-set weight
 * calls dropping four of five sets "held level" while volume falls 80%. For an
 * app whose promise is saying plainly when she came up short, either is a
 * defect. So a collapse on either axis is a shortfall regardless of the other,
 * and nothing counts as beating last time while something fell off a cliff.
 */
export function classify(
  previous: Performance,
  current: Performance,
): {
  status: Exclude<Comparison["status"], "first">;
  e1rmDeltaPct: number | null;
  volumeDeltaPct: number | null;
} {
  const deltas = {
    e1rmDeltaPct: pct(current.bestE1rm, previous.bestE1rm),
    volumeDeltaPct: pct(current.volumeKg, previous.volumeKg),
  };

  // With no load on either side there is only one axis. Estimated 1RM
  // degenerates to the best set's rep count, which would call 1×50 → 2×25 a 50%
  // collapse despite identical work, so judge bodyweight on total reps alone.
  const bodyweight = previous.volumeKg === 0 && current.volumeKg === 0;
  if (bodyweight) {
    const status = previous.totalReps === 0 && current.totalReps > 0
      ? "beat"
      : rose(current.totalReps, previous.totalReps)
        ? "beat"
        : fell(current.totalReps, previous.totalReps)
          ? "missed"
          : "matched";
    return { status, ...deltas };
  }

  const intensityFell = fell(current.bestE1rm, previous.bestE1rm);
  const intensityRose = rose(current.bestE1rm, previous.bestE1rm);

  const wentBackwards =
    droppedBy(current.bestE1rm, previous.bestE1rm, INTENSITY_COLLAPSE) ||
    droppedBy(current.volumeKg, previous.volumeKg, VOLUME_COLLAPSE) ||
    // Neither drop alone is dramatic, but down on both axes is still down.
    (intensityFell && fell(current.volumeKg, previous.volumeKg));

  // Her first recorded work on a movement beats having done none of it.
  const fromNothing = previous.volumeKg === 0 && current.volumeKg > 0;

  const status = wentBackwards
    ? "missed"
    // Top set down but volume up — an extra light set does not make it a better
    // session, and "up from last time" would be the wrong thing to tell her.
    : intensityFell
      ? "matched"
      : fromNothing || intensityRose || rose(current.volumeKg, previous.volumeKg)
        ? "beat"
        : "matched";

  return { status, ...deltas };
}

/**
 * Compare the two most recent performances of an exercise. This is the
 * function behind "last week you hit X" — and behind saying so plainly when
 * she came up short. No sugar-coating the number; the encouragement is the
 * coach's job, the arithmetic is this function's.
 */
export async function compareToPrevious(
  profileId: string,
  exerciseId: string,
  units: Units,
): Promise<Comparison> {
  const [ex] = await db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  const history = await exerciseHistory(profileId, exerciseId, 2);
  const current = history[0] ?? null;
  const previous = history[1] ?? null;
  const name = ex?.name ?? "exercise";

  if (!current) {
    return { exerciseId, exerciseName: name, previous: null, current: null, status: "first",
      e1rmDeltaPct: null, volumeDeltaPct: null, headline: `No history yet for ${name}.` };
  }
  if (!previous) {
    return { exerciseId, exerciseName: name, previous: null, current, status: "first",
      e1rmDeltaPct: null, volumeDeltaPct: null,
      headline: `First time logging ${name}: ${describe(current.sets, units)}. That's the baseline to beat.` };
  }

  const { status, e1rmDeltaPct, volumeDeltaPct } = classify(previous, current);

  const headline =
    status === "beat"
      ? `${name}: ${describe(current.sets, units)} — up from ${describe(previous.sets, units)} last time.`
      : status === "matched"
        ? `${name}: ${describe(current.sets, units)} — held level with last time.`
        : `${name}: ${describe(current.sets, units)} — down from ${describe(previous.sets, units)} last time.`;

  return { exerciseId, exerciseName: name, previous, current, status, e1rmDeltaPct, volumeDeltaPct, headline };
}

/**
 * The previous session's numbers for each exercise — what the Train screen
 * shows under "Last time".
 *
 * `excludeDate` must be passed when rendering a session in progress: otherwise
 * her first logged set of the day becomes "last time" and the comparison she
 * actually came for silently vanishes mid-workout.
 */
export async function lastTimeTargets(
  profileId: string,
  exerciseIds: string[],
  excludeDate?: ISODate,
) {
  if (exerciseIds.length === 0) return new Map<string, Performance>();
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      date: workouts.date,
      setNumber: setLogs.setNumber,
      reps: setLogs.reps,
      weightKg: setLogs.weightKg,
      rpe: setLogs.rpe,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(
      and(
        eq(workouts.profileId, profileId),
        inArray(setLogs.exerciseId, exerciseIds),
        ...(excludeDate ? [ne(workouts.date, excludeDate)] : []),
      ),
    )
    .orderBy(desc(workouts.date), setLogs.setNumber);

  const out = new Map<string, Performance>();
  const seenDate = new Map<string, ISODate>();
  const acc = new Map<string, SetSummary[]>();
  for (const r of rows) {
    const day = seenDate.get(r.exerciseId);
    if (day === undefined) seenDate.set(r.exerciseId, r.date);
    else if (day !== r.date) continue; // only the most recent session per exercise
    if (!acc.has(r.exerciseId)) acc.set(r.exerciseId, []);
    acc.get(r.exerciseId)!.push(r);
  }
  for (const [exId, sets] of acc) out.set(exId, summarise(seenDate.get(exId)!, sets));
  return out;
}

export type WeekReview = {
  weekStart: ISODate;
  planned: number;
  completed: number;
  missedDays: string[];
  totalVolumeKg: number;
  totalSets: number;
  /** Exercises where this week beat, matched, or fell short of the week before. */
  beat: string[];
  missed: string[];
  /** Latest weigh-in this week minus the last one before the week began
   *  (looking back up to a week). Null without one on each side. */
  weightChangeKg: number | null;
  /** Most recent weigh-in in the last two weeks, whichever side of Monday. */
  latestWeightKg: number | null;
};

/**
 * The weekly honesty report. Feeds both the Progress screen and the coach's
 * Monday check-in — one computation, two surfaces.
 */
export async function weekReview(
  profileId: string,
  units: Units,
  week: ISODate = weekStart(),
): Promise<WeekReview> {
  const weekEnd = addDays(week, 6);
  const prevWeek = addDays(week, -7);

  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week)))
    .limit(1);

  const plannedDays = plan
    ? await db
        .select({ id: planDays.id, dayOfWeek: planDays.dayOfWeek, title: planDays.title })
        .from(planDays)
        .where(and(eq(planDays.planId, plan.id), eq(planDays.isRest, false)))
    : [];

  const done = await db
    .select({ id: workouts.id, date: workouts.date, planDayId: workouts.planDayId, title: workouts.title })
    .from(workouts)
    .where(and(eq(workouts.profileId, profileId), gte(workouts.date, week), lte(workouts.date, weekEnd),
      sql`${workouts.completedAt} is not null`));

  const [totals] = await db
    .select({
      sets: sql<number>`count(*)::int`,
      volume: sql<number>`coalesce(sum(coalesce(${setLogs.weightKg}, 0) * ${setLogs.reps}), 0)::real`,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), gte(workouts.date, week), lte(workouts.date, weekEnd)));

  // A planned day is done when a completed workout points at it. Title is
  // only the fallback for workouts started freeform (no plan day): matching
  // on title alone let one "Full body" session tick off both of them.
  const doneIds = new Set(done.map((w) => w.planDayId).filter((id): id is string => id !== null));
  const freeformTitles = new Set(done.filter((w) => w.planDayId === null).map((w) => w.title));
  const missedDays = plannedDays
    .filter((d) => !doneIds.has(d.id) && !freeformTitles.has(d.title))
    .map((d) => d.title);

  // Compare each exercise trained this week against its previous outing.
  const trained = await db
    .selectDistinct({ exerciseId: setLogs.exerciseId })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), gte(workouts.date, week), lte(workouts.date, weekEnd)));

  const comparisons = await Promise.all(
    trained.map((t) => compareToPrevious(profileId, t.exerciseId, units)),
  );

  const weights = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(and(eq(weighIns.profileId, profileId), gte(weighIns.date, prevWeek), lte(weighIns.date, weekEnd)))
    .orderBy(weighIns.date);

  // "This week's change" means exactly that: the latest weigh-in inside the
  // week against the last one before it began. The old first-to-last across
  // the fetched window quietly spanned two weeks.
  const thisWeek = weights.filter((w) => w.date >= week);
  const before = weights.filter((w) => w.date < week);
  const latestWeightKg = weights.at(-1)?.weightKg ?? null;
  const weightChangeKg =
    thisWeek.length > 0 && before.length > 0
      ? thisWeek[thisWeek.length - 1].weightKg - before[before.length - 1].weightKg
      : null;

  return {
    weekStart: week,
    planned: plannedDays.length,
    completed: done.length,
    missedDays,
    totalVolumeKg: totals?.volume ?? 0,
    totalSets: totals?.sets ?? 0,
    beat: comparisons.filter((c) => c.status === "beat").map((c) => c.headline),
    missed: comparisons.filter((c) => c.status === "missed").map((c) => c.headline),
    weightChangeKg,
    latestWeightKg,
  };
}

/** Consecutive days ending today (or yesterday) with a completed workout. */
export async function currentStreak(profileId: string): Promise<number> {
  const rows = await db
    .select({ date: workouts.date })
    .from(workouts)
    .where(and(eq(workouts.profileId, profileId), sql`${workouts.completedAt} is not null`))
    .orderBy(desc(workouts.date));
  const days = [...new Set(rows.map((r) => r.date))];
  if (days.length === 0) return 0;

  let streak = 0;
  let cursor = days[0];
  for (const d of days) {
    if (d === cursor) { streak++; cursor = addDays(cursor, -1); }
    else if (d < cursor) break;
  }
  return streak;
}

/**
 * A one-line picture of today, injected into the volatile half of the system
 * prompt. Without it the coach assumes nothing has been logged and asks her to
 * retype sets she already tapped in on the Train screen.
 */
export async function todaySnapshot(
  profileId: string,
  units: Units,
  date: ISODate = today(),
): Promise<string> {
  const [workout] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.profileId, profileId), eq(workouts.date, date)))
    .orderBy(desc(workouts.startedAt))
    .limit(1);

  if (!workout) return `Today: no workout started yet.`;

  const rows = await db
    .select({
      name: exercises.name,
      reps: setLogs.reps,
      weightKg: setLogs.weightKg,
    })
    .from(setLogs)
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(eq(setLogs.workoutId, workout.id))
    .orderBy(setLogs.loggedAt);

  if (rows.length === 0) {
    return `Today: "${workout.title}" is open but no sets logged yet.`;
  }

  const byExercise = new Map<string, { reps: number; weightKg: number | null }[]>();
  for (const r of rows) {
    if (!byExercise.has(r.name)) byExercise.set(r.name, []);
    byExercise.get(r.name)!.push(r);
  }
  // Must render every set, not just the first. Collapsing six sets onto set
  // one's weight once reported "6×8 @ 60lb" for a session whose last three sets
  // were at 95 — the model then told her she was still at 60, because that is
  // what this line said. It hid a PR.
  const summary = [...byExercise.entries()]
    .map(([name, sets]) => `${name} ${describe(sets, units)}`)
    .join("; ");

  return `Today she has ALREADY LOGGED: ${summary}${workout.completedAt ? " (session finished)" : " (session still open)"}. Do not ask her to retype any of this — read it with get_week_review or get_exercise_history.`;
}

/* ── Body measurements ─────────────────────────────────────────────────── */

export type SiteProgress = {
  site: string;
  label: string;
  /** All values already converted to her display units. */
  current: number | null;
  currentDate: ISODate | null;
  first: number | null;
  firstDate: ISODate | null;
  previous: number | null;
  previousDate: ISODate | null;
  /** Negative means she lost inches — the direction she's after. */
  changeTotal: number | null;
  changeSinceLast: number | null;
  history: { date: ISODate; value: number }[];
};

/**
 * Per-site progress, newest first. Returns every site she has ever logged;
 * sites she's never measured are simply absent, so the UI can offer them
 * separately rather than showing a wall of empty rows.
 */
export async function measurementProgress(
  profileId: string,
  units: Units,
): Promise<SiteProgress[]> {
  const rows = await db
    .select({ site: measurements.site, date: measurements.date, valueCm: measurements.valueCm })
    .from(measurements)
    .where(eq(measurements.profileId, profileId))
    .orderBy(measurements.site, measurements.date);

  const bySite = new Map<string, { date: ISODate; value: number }[]>();
  for (const r of rows) {
    if (!bySite.has(r.site)) bySite.set(r.site, []);
    bySite.get(r.site)!.push({ date: r.date, value: lengthOut(r.valueCm, units)! });
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  // Preserve the canonical site order rather than whatever the query returned.
  return SITES.filter((s) => bySite.has(s.key)).map((s) => {
    const history = bySite.get(s.key)!; // ascending by date
    const first = history[0];
    const current = history[history.length - 1];
    const previous = history.length > 1 ? history[history.length - 2] : null;

    return {
      site: s.key,
      label: s.label,
      current: current.value,
      currentDate: current.date,
      first: first.value,
      firstDate: first.date,
      previous: previous?.value ?? null,
      previousDate: previous?.date ?? null,
      changeTotal: history.length > 1 ? round1(current.value - first.value) : null,
      changeSinceLast: previous ? round1(current.value - previous.value) : null,
      history: [...history].reverse(),
    };
  });
}

/**
 * The recomposition check: weight flat (or up) while the waist is going down.
 * This is the single most useful thing measurements buy her, and the moment a
 * coach is most needed — it's exactly when people quit.
 */
/** Below this, a waist change is as likely to be how the tape was held. */
const MIN_RECOMP_DAYS = 14;

/**
 * Her weight, as the coach should state it: the trend, and how much of one
 * there is. Goes into the volatile state block, where the model believes it
 * completely — so when the data cannot support a direction this says so
 * rather than naming one.
 */
export async function weightSignal(
  profileId: string,
  units: Units,
  asOf: ISODate,
): Promise<string> {
  const rows = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(eq(weighIns.profileId, profileId))
    .orderBy(desc(weighIns.date))
    .limit(120);

  const t = weightTrend(rows, asOf);
  const unit = weightLabel(units);
  const fmt = (kg: number) => `${weightOut(kg, units)}${unit}`;

  if (t.confidence === "none") return "Weight: nothing logged yet.";

  const last = `Last weigh-in ${fmt(t.latestRawKg!)} on ${t.latestDate}` +
    (t.daysSinceLastWeighIn && t.daysSinceLastWeighIn > 3
      ? ` (${t.daysSinceLastWeighIn} days ago)`
      : "");

  if (t.confidence === "low") {
    return `Weight: trend ${fmt(t.trendKg!)}. ${last}. Only ${t.weighInsLast14Days} weigh-in`
      + `${t.weighInsLast14Days === 1 ? "" : "s"} in the last fortnight, which is too few to state`
      + ` a direction — do not tell her she is up or down, and do not read the last reading as progress.`;
  }

  const change = t.weeklyChangeKg!;
  const direction = Math.abs(change) < 0.1
    ? "level over the last week"
    : `${change < 0 ? "down" : "up"} ${fmt(Math.abs(change))} over the last week`;
  return `Weight: trend ${fmt(t.trendKg!)}, ${direction} (from ${t.weighInsLast14Days} weigh-ins`
    + ` in the last fortnight). ${last}. Talk about the trend, not the last reading.`;
}

export async function recompositionSignal(
  profileId: string,
  units: Units,
): Promise<string | null> {
  const sites = await measurementProgress(profileId, units);
  const waist = sites.find((s) => s.site === "waist");
  if (!waist || waist.changeTotal === null || waist.changeTotal >= -0.5) return null;

  // Over a long enough span to be a trend rather than a tape held differently.
  // This goes into the prompt prefixed IMPORTANT and the model believes it
  // completely, so half an inch across three days must not become "that is fat
  // loss the scale cannot see" — an encouraging claim is still a false one.
  if (waist.firstDate === null || waist.currentDate === null) return null;
  if (daysBetween(waist.firstDate, waist.currentDate) < MIN_RECOMP_DAYS) return null;

  const weights = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(eq(weighIns.profileId, profileId))
    .orderBy(weighIns.date);
  if (weights.length < 2) return null;

  // Only compare weight over the same span the waist change covers.
  const inWindow = weights.filter((w) => waist.firstDate !== null && w.date >= waist.firstDate);
  if (inWindow.length < 2) return null;

  // Trend to trend, not reading to reading: two noisy endpoints can show a
  // kilo of "change" that is water, and this claim goes into the prompt marked
  // IMPORTANT — an encouraging sentence built on noise is still a false one.
  const trend = trendSeries(inWindow);
  const weightChangeKg = trend[trend.length - 1].trend - trend[0].trend;
  const stalled = Math.abs(weightChangeKg) < 0.7; // under ~1.5 lb either way

  if (!stalled) return null;
  return `Her weight has been flat since ${waist.firstDate} but her waist is down ${Math.abs(waist.changeTotal)}${lengthLabel(units)}. That is fat loss the scale cannot see — tell her plainly, because this is exactly when people conclude it isn't working and stop.`;
}

/**
 * Where each open milestone actually stands, computed from logged data.
 *
 * Without this the coach answers "did I hit my squat goal?" from whatever it
 * said earlier in the conversation, which anchors hard: it told her she was at
 * 60lb twice, then kept repeating it after she had logged 95. Stating the
 * measured position outright is the only thing that has reliably beaten that.
 */
export async function goalProgress(profileId: string, units: Units): Promise<string> {
  const open = await db
    .select()
    .from(goals)
    .where(and(eq(goals.profileId, profileId), sql`${goals.achievedAt} is null`))
    .orderBy(goals.sortOrder, goals.createdAt);
  if (open.length === 0) return "No open milestones.";

  const [latestWeight] = await db
    .select({ weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(eq(weighIns.profileId, profileId))
    .orderBy(desc(weighIns.date))
    .limit(1);

  // Which way a weight milestone points. A goal set below where she was is a
  // loss goal, above is a gain goal; "reached" used to assume loss, which
  // would have declared a gain goal hit on day one.
  const [start] = await db.select({ startWeightKg: profiles.startWeightKg })
    .from(profiles).where(eq(profiles.id, profileId)).limit(1);
  const weightWhen = async (at: Date): Promise<number | null> => {
    const [w] = await db
      .select({ weightKg: weighIns.weightKg })
      .from(weighIns)
      .where(and(eq(weighIns.profileId, profileId), lte(weighIns.date, toISODate(at))))
      .orderBy(desc(weighIns.date))
      .limit(1);
    return w?.weightKg ?? start?.startWeightKg ?? null;
  };

  const lines = await Promise.all(
    open.map(async (g) => {
      const label = `"${g.title}" (id ${g.id})`;

      if (g.kind === "weight" && g.targetValue !== null) {
        const now = latestWeight?.weightKg;
        if (now === undefined) return `- ${label}: no weigh-ins yet.`;
        const from = await weightWhen(g.createdAt);
        const gaining = from !== null && g.targetValue > from;
        const reached = gaining ? now >= g.targetValue : now <= g.targetValue;
        return `- ${label} (${gaining ? "gain" : "loss"} goal): currently ${weightOut(now, units)}${weightLabel(units)}, target ${weightOut(g.targetValue, units)}${weightLabel(units)}. ${reached ? "REACHED — call achieve_goal." : "Not yet."}`;
      }

      if (g.exerciseId) {
        const history = await exerciseHistory(profileId, g.exerciseId, 12);
        if (history.length === 0) return `- ${label}: nothing logged for that movement yet.`;
        const best = history.reduce((a, b) => (b.bestE1rm > a.bestE1rm ? b : a));
        const heaviest = Math.max(...best.sets.map((s) => s.weightKg ?? 0));
        const target = g.targetValue;
        const hit = target !== null && heaviest >= target;
        return (
          `- ${label}: best session ${describe(best.sets, units)} on ${best.date}` +
          (target === null
            ? "."
            : `, target ${weightOut(target, units)}${weightLabel(units)}. ` +
              (hit
                ? "Target WEIGHT reached — check the sets and reps in the title before calling achieve_goal."
                : "Not yet."))
        );
      }

      return `- ${label}: ${g.targetValue ?? "?"} ${g.unit ?? ""} — no logged data links to this one; ask her.`.trim();
    }),
  );

  return `Open milestones, measured from her logged data:\n${lines.join("\n")}`;
}

/* ── Progression over time ─────────────────────────────────────────────── */

export type ProgressionPoint = {
  date: ISODate;
  sets: number;
  reps: number;
  /** Display units. Null for bodyweight movements. */
  topSet: number | null;
  volume: number;
  e1rm: number;
};

export type ExerciseProgression = {
  slug: string;
  name: string;
  bodyweight: boolean;
  sessions: ProgressionPoint[];
  /** Oldest to newest change in the number that best describes the movement. */
  changePct: number | null;
  /** Days since she last did it. */
  daysSince: number;
  trend: "climbing" | "holding" | "slipping" | "stalled" | "new";
  /** One plain sentence, written so a summary can quote it directly. */
  headline: string;
};

/**
 * How each movement has actually gone over time.
 *
 * The comparison engine answers "versus last time"; this answers "over the last
 * two months", which is the question that decides whether the programme is
 * working. Bodyweight movements are judged on reps, loaded ones on estimated
 * 1RM, because top-set weight alone hides a rep-range change.
 */
export async function exerciseProgression(
  profileId: string,
  units: Units,
  opts: { sinceDays?: number; minSessions?: number; asOf?: ISODate } = {},
): Promise<ExerciseProgression[]> {
  // asOf is her today. "5 days since you last did it" is wrong by one whenever
  // the server's date has rolled over and hers has not.
  const asOf = opts.asOf ?? today();
  const since = addDays(asOf, -(opts.sinceDays ?? 84)); // twelve weeks
  const minSessions = opts.minSessions ?? 1;

  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      slug: exercises.slug,
      name: exercises.name,
      bodyweight: exercises.bodyweight,
      date: workouts.date,
      reps: setLogs.reps,
      weightKg: setLogs.weightKg,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(eq(workouts.profileId, profileId), gte(workouts.date, since)))
    .orderBy(workouts.date);

  // exercise -> date -> sets
  const byExercise = new Map<string, { meta: (typeof rows)[number]; days: Map<ISODate, typeof rows> }>();
  for (const r of rows) {
    if (!byExercise.has(r.slug)) byExercise.set(r.slug, { meta: r, days: new Map() });
    const entry = byExercise.get(r.slug)!;
    if (!entry.days.has(r.date)) entry.days.set(r.date, []);
    entry.days.get(r.date)!.push(r);
  }

  const out: ExerciseProgression[] = [];

  for (const [slug, { meta, days }] of byExercise) {
    const sessions: ProgressionPoint[] = [...days.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, sets]) => {
        const volumeKg = sets.reduce((n, s) => n + (s.weightKg ?? 0) * s.reps, 0);
        const best = sets.reduce((a, b) => (e1rm(b.weightKg, b.reps) > e1rm(a.weightKg, a.reps) ? b : a));
        return {
          date,
          sets: sets.length,
          reps: sets.reduce((n, s) => n + s.reps, 0),
          topSet: weightOut(Math.max(...sets.map((s) => s.weightKg ?? 0)) || null, units),
          volume: Math.round(volumeKg * (units === "imperial" ? 2.20462 : 1)),
          e1rm: Math.round(e1rm(best.weightKg, best.reps) * 10) / 10,
        };
      });

    if (sessions.length < minSessions) continue;

    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    // Loaded movements are judged on estimated 1RM; bodyweight on total reps,
    // where 1RM degenerates to the top set's rep count.
    const metric = (s: ProgressionPoint) => (meta.bodyweight ? s.reps : s.e1rm);
    const changePct =
      sessions.length > 1 && metric(first) > 0
        ? ((metric(last) - metric(first)) / metric(first)) * 100
        : null;

    const daysSince = daysBetween(last.date, asOf);
    const unit = weightLabel(units);
    const describeLast = meta.bodyweight
      ? `${last.sets}×${Math.round(last.reps / last.sets)}`
      : `${last.sets}×${Math.round(last.reps / last.sets)}${last.topSet ? ` @ ${last.topSet}${unit}` : ""}`;

    let trend: ExerciseProgression["trend"];
    let headline: string;

    if (sessions.length === 1) {
      trend = "new";
      headline = `${meta.name}: one session so far, ${describeLast}. Nothing to compare yet.`;
    } else if (daysSince > 21) {
      trend = "stalled";
      headline = `${meta.name}: nothing logged for ${daysSince} days. Last was ${describeLast}.`;
    } else if ((changePct ?? 0) > 5) {
      trend = "climbing";
      headline = `${meta.name}: up ${Math.round(changePct!)}% over ${sessions.length} sessions, now ${describeLast}.`;
    } else if ((changePct ?? 0) < -5) {
      trend = "slipping";
      headline = `${meta.name}: down ${Math.abs(Math.round(changePct!))}% over ${sessions.length} sessions, now ${describeLast}.`;
    } else {
      trend = "holding";
      headline = `${meta.name}: level across ${sessions.length} sessions at ${describeLast}. Ready for more.`;
    }

    out.push({
      slug, name: meta.name, bodyweight: meta.bodyweight,
      sessions, changePct, daysSince, trend, headline,
    });
  }

  // Anything going backwards or abandoned first — that is what needs attention.
  const rank = { slipping: 0, stalled: 1, holding: 2, climbing: 3, new: 4 } as const;
  return out.sort((a, b) => rank[a.trend] - rank[b.trend] || b.sessions.length - a.sessions.length);
}

export type NutritionDay = {
  date: ISODate;
  /** False when she logged nothing. Not the same as a zero-calorie day. */
  logged: boolean;
  calories: number | null;
  proteinG: number | null;
  entries: number;
};

export type NutritionTrend = {
  days: NutritionDay[];
  /** Days with at least one entry, out of the window. */
  daysLogged: number;
  windowDays: number;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  /** Averages across logged days only — see the note below. */
  avgCalories: number | null;
  avgProteinG: number | null;
  /** Logged days that came in at or under the calorie target. */
  daysOnTarget: number;
  trend: "on-track" | "over" | "under-logged" | "no-data";
  headline: string;
};

/**
 * What she has actually eaten over the last fortnight, against her targets.
 *
 * The whole difficulty is the unlogged day. A day with no entries is not a
 * zero-calorie day, and averaging zeros into the total invents a deficit she
 * never ran — the app would congratulate her for forgetting to log. So averages
 * are taken across logged days only, the logged-day count travels with them,
 * and a window that is mostly empty reports "under-logged" rather than any
 * judgement about her eating.
 *
 * The same reasoning as fibreForDay, one level up.
 */
export async function nutritionTrend(
  profileId: string,
  windowDays = 14,
  end: ISODate = today(),
): Promise<NutritionTrend> {
  const start = addDays(end, -(windowDays - 1));

  const rows = await db.select({
    date: mealLogs.date, calories: mealLogs.calories, proteinG: mealLogs.proteinG,
  }).from(mealLogs)
    .where(and(eq(mealLogs.profileId, profileId), gte(mealLogs.date, start), lte(mealLogs.date, end)));

  const [plan] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), eq(mealPlans.weekStart, weekStart(end)))).limit(1);
  const calorieTarget = plan?.calorieTarget ?? null;
  const proteinTargetG = plan?.proteinTargetG ?? null;

  const days: NutritionDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(start, i);
    const forDay = rows.filter((r) => r.date === date);
    days.push({
      date,
      logged: forDay.length > 0,
      calories: forDay.length ? forDay.reduce((n, r) => n + (r.calories ?? 0), 0) : null,
      proteinG: forDay.length ? forDay.reduce((n, r) => n + (r.proteinG ?? 0), 0) : null,
      entries: forDay.length,
    });
  }

  return summariseNutrition(days, calorieTarget, proteinTargetG);
}

/**
 * The judgement half of nutritionTrend, kept pure so it can be tested without
 * a database — the classification is where this gets it wrong, not the query.
 */
export function summariseNutrition(
  days: NutritionDay[],
  calorieTarget: number | null,
  proteinTargetG: number | null,
): NutritionTrend {
  const windowDays = days.length;
  const loggedDays = days.filter((d) => d.logged);
  const daysLogged = loggedDays.length;

  // Averaged across logged days only. Including unlogged days as zero invents
  // a deficit she never ran, and the app would congratulate her for forgetting.
  const avg = (pick: (d: NutritionDay) => number | null) =>
    daysLogged === 0
      ? null
      : Math.round(loggedDays.reduce((n, d) => n + (pick(d) ?? 0), 0) / daysLogged);

  const avgCalories = avg((d) => d.calories);
  const daysOnTarget = calorieTarget === null
    ? 0
    : loggedDays.filter((d) => (d.calories ?? 0) <= calorieTarget).length;

  const against =
    `Averaging ${avgCalories} kcal on the ${daysLogged} days logged, against a ` +
    `${calorieTarget} target — ${daysOnTarget} of those days came in at or under it.`;

  let trend: NutritionTrend["trend"];
  let headline: string;
  if (daysLogged === 0) {
    trend = "no-data";
    headline = `Nothing logged in the last ${windowDays} days.`;
  } else if (daysLogged < windowDays / 2) {
    // Too sparse to say anything about her eating. Saying it anyway is how an
    // app tells someone they are doing badly at something it cannot see.
    trend = "under-logged";
    headline =
      `Only ${daysLogged} of the last ${windowDays} days have any food logged, ` +
      `so there is not enough here to judge how the eating is going.`;
  } else if (calorieTarget === null) {
    trend = "on-track";
    headline = `Averaging ${avgCalories} kcal across ${daysLogged} logged days. No calorie target set yet.`;
  } else if (avgCalories !== null && avgCalories > calorieTarget * 1.05) {
    trend = "over";
    headline = against;
  } else {
    trend = "on-track";
    headline = against;
  }

  return {
    days, daysLogged, windowDays, calorieTarget, proteinTargetG,
    avgCalories, avgProteinG: avg((d) => d.proteinG), daysOnTarget, trend, headline,
  };
}
