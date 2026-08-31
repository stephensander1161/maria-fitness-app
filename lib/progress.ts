import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, goals, measurements, planDays, plans, setLogs, weighIns, workouts } from "@/lib/db/schema";
import { addDays, type ISODate, today, weekStart } from "@/lib/date";
import { kgToLb, lengthLabel, lengthOut, weightLabel, weightOut, type Units } from "@/lib/units";
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
  weightChangeKg: number | null;
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
    trained.map((t) => compareToPrevious(profileId, t.exerciseId, units)),
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

  const lines = await Promise.all(
    open.map(async (g) => {
      const label = `"${g.title}" (id ${g.id})`;

      if (g.kind === "weight" && g.targetValue !== null) {
        const now = latestWeight?.weightKg;
        if (now === undefined) return `- ${label}: no weigh-ins yet.`;
        const reached = now <= g.targetValue;
        return `- ${label}: currently ${weightOut(now, units)}${weightLabel(units)}, target ${weightOut(g.targetValue, units)}${weightLabel(units)}. ${reached ? "REACHED — call achieve_goal." : "Not yet."}`;
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
