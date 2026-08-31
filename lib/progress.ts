import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, measurements, planDays, plans, setLogs, weighIns, workouts } from "@/lib/db/schema";
import { addDays, type ISODate, today, weekStart } from "@/lib/date";
import { lengthLabel, lengthOut, type Units } from "@/lib/units";
import { SITES } from "@/lib/measurements";

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

function summarise(date: ISODate, rows: SetSummary[]): Performance {
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
    .where(and(eq(workouts.profileId, profileId), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(desc(workouts.date), setLogs.setNumber);

  const byDate = new Map<ISODate, SetSummary[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  return [...byDate.entries()].slice(0, limit).map(([date, sets]) => summarise(date, sets));
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

function describe(sets: SetSummary[]): string {
  if (sets.length === 0) return "nothing logged";
  const w = sets[0].weightKg;
  const sameWeight = sets.every((s) => s.weightKg === w);
  const sameReps = sets.every((s) => s.reps === sets[0].reps);
  const load = w === null ? "" : ` @ ${Math.round(w * 2.20462)}lb`;
  if (sameWeight && sameReps) return `${sets.length}×${sets[0].reps}${load}`;
  return sets.map((s) => `${s.reps}${s.weightKg === null ? "" : `@${Math.round(s.weightKg * 2.20462)}`}`).join(", ");
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
      headline: `First time logging ${name}: ${describe(current.sets)}. That's the baseline to beat.` };
  }

  const e1rmDeltaPct = pct(current.bestE1rm, previous.bestE1rm);
  const volumeDeltaPct = pct(current.volumeKg, previous.volumeKg);
  // A 2% band absorbs rounding on plate jumps so a genuine repeat reads as "matched".
  const status: Comparison["status"] =
    current.bestE1rm > previous.bestE1rm * 1.02 || current.totalReps > previous.totalReps
      ? "beat"
      : current.bestE1rm >= previous.bestE1rm * 0.98
        ? "matched"
        : "missed";

  const headline =
    status === "beat"
      ? `${name}: ${describe(current.sets)} — up from ${describe(previous.sets)} last time.`
      : status === "matched"
        ? `${name}: ${describe(current.sets)} — held level with last time.`
        : `${name}: ${describe(current.sets)} — down from ${describe(previous.sets)} last time.`;

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
  weightChangeKg: number | null;
  latestWeightKg: number | null;
};

/**
 * The weekly honesty report. Feeds both the Progress screen and the coach's
 * Monday check-in — one computation, two surfaces.
 */
export async function weekReview(profileId: string, week: ISODate = weekStart()): Promise<WeekReview> {
  const weekEnd = addDays(week, 6);
  const prevWeek = addDays(week, -7);

  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week)))
    .limit(1);

  const plannedDays = plan
    ? await db
        .select({ dayOfWeek: planDays.dayOfWeek, title: planDays.title })
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

  const doneTitles = new Set(done.map((w) => w.title));
  const missedDays = plannedDays.filter((d) => !doneTitles.has(d.title)).map((d) => d.title);

  // Compare each exercise trained this week against its previous outing.
  const trained = await db
    .selectDistinct({ exerciseId: setLogs.exerciseId })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .where(and(eq(workouts.profileId, profileId), gte(workouts.date, week), lte(workouts.date, weekEnd)));

  const comparisons = await Promise.all(
    trained.map((t) => compareToPrevious(profileId, t.exerciseId)),
  );

  const weights = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(and(eq(weighIns.profileId, profileId), gte(weighIns.date, prevWeek), lte(weighIns.date, weekEnd)))
    .orderBy(weighIns.date);

  const latestWeightKg = weights.at(-1)?.weightKg ?? null;
  const weightChangeKg =
    weights.length >= 2 ? weights[weights.length - 1].weightKg - weights[0].weightKg : null;

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
export async function todaySnapshot(profileId: string, date: ISODate = today()): Promise<string> {
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
  const summary = [...byExercise.entries()]
    .map(([name, sets]) => `${name} ${sets.length}×${sets[0].reps}${sets[0].weightKg !== null ? ` @ ${Math.round(sets[0].weightKg * 2.20462)}lb` : ""}`)
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
export async function recompositionSignal(
  profileId: string,
  units: Units,
): Promise<string | null> {
  const sites = await measurementProgress(profileId, units);
  const waist = sites.find((s) => s.site === "waist");
  if (!waist || waist.changeTotal === null || waist.changeTotal >= -0.5) return null;

  const weights = await db
    .select({ date: weighIns.date, weightKg: weighIns.weightKg })
    .from(weighIns)
    .where(eq(weighIns.profileId, profileId))
    .orderBy(weighIns.date);
  if (weights.length < 2) return null;

  // Only compare weight over the same span the waist change covers.
  const inWindow = weights.filter((w) => waist.firstDate !== null && w.date >= waist.firstDate);
  if (inWindow.length < 2) return null;

  const weightChangeKg = inWindow[inWindow.length - 1].weightKg - inWindow[0].weightKg;
  const stalled = Math.abs(weightChangeKg) < 0.7; // under ~1.5 lb either way

  if (!stalled) return null;
  return `Her weight has been flat since ${waist.firstDate} but her waist is down ${Math.abs(waist.changeTotal)}${lengthLabel(units)}. That is fat loss the scale cannot see — tell her plainly, because this is exactly when people conclude it isn't working and stop.`;
}
