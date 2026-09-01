import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, mealLogs, mealPlans, meals, planDays, planExercises, plans, setLogs, workouts,
} from "@/lib/db/schema";
import { addDays, DAY_NAMES, dayIndex, today, weekStart, type ISODate } from "@/lib/date";
import { weightLabel, weightOut, type Units } from "@/lib/units";
import { exerciseHistory, lastTimeTargets } from "@/lib/progress";
import { FIBRE_TARGET_G, fibreForDay } from "@/lib/nutrition";

/**
 * Read models for the screens. Pages render from these; mutations always go
 * back through the tool registry, so there's exactly one write path.
 */
export type TodayExercise = {
  slug: string; name: string; bodyweight: boolean;
  /** Drives the wireframe figure's fallback when the name matches no pattern. */
  category: string;
  /** Logged today but not on the plan — an extra she added, or one she removed
   *  from the schedule after already training it. Never hide logged work. */
  extra: boolean;
  targetSets: number; targetReps: number; targetWeight: number | null;
  restSeconds: number; notes: string | null;
  lastTime: { date: ISODate; sets: { reps: number; weight: number | null }[] } | null;
  loggedToday: { setNumber: number; reps: number; weight: number | null }[];
  /** Recent sessions, oldest first, for the trend shown once she finishes her
   *  target sets. Excludes today — the point is what came before. */
  trend: { date: ISODate; volume: number; topSet: number | null; reps: number }[];
};

export type TodayView = {
  date: ISODate; dayName: string; hasPlan: boolean;
  title: string; focus: string | null; isRest: boolean; notes: string | null;
  unit: string; units: Units;
  exercises: TodayExercise[];
  completed: boolean;
};

export async function todayView(profileId: string, units: Units, date = today()): Promise<TodayView> {
  const dow = dayIndex(date);
  const base = {
    date, dayName: DAY_NAMES[dow], unit: weightLabel(units), units,
    hasPlan: false, title: "No plan yet", focus: null, isRest: false,
    notes: null, exercises: [], completed: false,
  } satisfies TodayView;

  const [plan] = await db.select({ id: plans.id }).from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, weekStart(date)))).limit(1);
  if (!plan) return base;

  const [day] = await db.select().from(planDays)
    .where(and(eq(planDays.planId, plan.id), eq(planDays.dayOfWeek, dow))).limit(1);
  if (!day) return { ...base, hasPlan: true };

  const items = await db.select({
    exerciseId: exercises.id, slug: exercises.slug, name: exercises.name,
    bodyweight: exercises.bodyweight, category: exercises.category,
    targetSets: planExercises.targetSets, targetReps: planExercises.targetReps,
    targetWeightKg: planExercises.targetWeightKg,
    restSeconds: planExercises.restSeconds, notes: planExercises.notes,
  }).from(planExercises)
    .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
    .where(eq(planExercises.planDayId, day.id))
    .orderBy(asc(planExercises.sortOrder));

  const [workout] = await db.select().from(workouts)
    .where(and(eq(workouts.profileId, profileId), eq(workouts.date, date))).limit(1);

  const logged = workout
    ? await db.select({
        exerciseId: setLogs.exerciseId, setNumber: setLogs.setNumber,
        reps: setLogs.reps, weightKg: setLogs.weightKg,
      }).from(setLogs).where(eq(setLogs.workoutId, workout.id)).orderBy(asc(setLogs.setNumber))
    : [];

  // Exclude today so an in-progress session never masks last week's numbers.
  // Anything she logged today that is not on the plan still gets a card. Without
  // this, removing an exercise from the schedule would hide sets she had already
  // done — the work would look like it never happened.
  const plannedIds = new Set(items.map((i) => i.exerciseId));
  const extraIds = [...new Set(logged.map((l) => l.exerciseId))].filter((id) => !plannedIds.has(id));
  const extras = extraIds.length
    ? await db.select({
        exerciseId: exercises.id, slug: exercises.slug, name: exercises.name,
        bodyweight: exercises.bodyweight, category: exercises.category,
      }).from(exercises).where(inArray(exercises.id, extraIds))
    : [];

  const all = [
    ...items.map((i) => ({ ...i, extra: false })),
    ...extras.map((e) => ({
      ...e, extra: true,
      targetSets: 0, targetReps: 0, targetWeightKg: null as number | null,
      restSeconds: 90, notes: null as string | null,
    })),
  ];

  const lastTime = await lastTimeTargets(profileId, all.map((i) => i.exerciseId), date);

  // Three weeks of history per movement, so finishing a set can show her where
  // it sits against recent sessions without another round trip.
  const trends = new Map<string, TodayExercise["trend"]>();
  await Promise.all(
    all.map(async (i) => {
      const history = await exerciseHistory(profileId, i.exerciseId, 4);
      trends.set(
        i.exerciseId,
        history
          .filter((h) => h.date !== date)
          .slice(0, 3)
          .reverse()
          .map((h) => ({
            date: h.date,
            volume: Math.round(h.volumeKg * (units === "imperial" ? 2.20462 : 1)),
            topSet: h.bestSet?.weightKg == null ? null : weightOut(h.bestSet.weightKg, units),
            reps: h.totalReps,
          })),
      );
    }),
  );

  return {
    ...base,
    hasPlan: true,
    title: day.title, focus: day.focus, isRest: day.isRest, notes: day.notes,
    completed: workout?.completedAt != null,
    exercises: all.map((i) => {
      const prev = lastTime.get(i.exerciseId);
      return {
        slug: i.slug, name: i.name, bodyweight: i.bodyweight,
        category: i.category, extra: i.extra,
        targetSets: i.targetSets, targetReps: i.targetReps,
        targetWeight: weightOut(i.targetWeightKg, units),
        restSeconds: i.restSeconds, notes: i.notes,
        lastTime: prev
          ? { date: prev.date, sets: prev.sets.map((s) => ({ reps: s.reps, weight: weightOut(s.weightKg, units) })) }
          : null,
        loggedToday: logged.filter((l) => l.exerciseId === i.exerciseId)
          .map((l) => ({ setNumber: l.setNumber, reps: l.reps, weight: weightOut(l.weightKg, units) })),
        trend: trends.get(i.exerciseId) ?? [],
      };
    }),
  };
}

export type WeekView = {
  weekStart: ISODate; exists: boolean; title: string; rationale: string | null;
  todayIndex: number; unit: string;
  days: {
    dayOfWeek: number; dayName: string; title: string; focus: string | null;
    isRest: boolean; notes: string | null;
    exercises: { slug: string; name: string; target: string; notes: string | null }[];
  }[];
};

export async function weekView(profileId: string, units: Units, week = weekStart()): Promise<WeekView> {
  const [plan] = await db.select().from(plans)
    .where(and(eq(plans.profileId, profileId), eq(plans.weekStart, week))).limit(1);
  if (!plan) {
    return { weekStart: week, exists: false, title: "", rationale: null,
      todayIndex: dayIndex(), unit: weightLabel(units), days: [] };
  }

  const days = await db.select().from(planDays)
    .where(eq(planDays.planId, plan.id)).orderBy(asc(planDays.dayOfWeek));

  const items = days.length
    ? await db.select({
        planDayId: planExercises.planDayId, slug: exercises.slug, name: exercises.name,
        sets: planExercises.targetSets, reps: planExercises.targetReps,
        weightKg: planExercises.targetWeightKg, notes: planExercises.notes,
        sortOrder: planExercises.sortOrder,
      }).from(planExercises)
        .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
        .orderBy(asc(planExercises.sortOrder))
    : [];

  const dayIds = new Set(days.map((d) => d.id));
  return {
    weekStart: week, exists: true, title: plan.title, rationale: plan.rationale,
    todayIndex: dayIndex(), unit: weightLabel(units),
    days: days.map((d) => ({
      dayOfWeek: d.dayOfWeek, dayName: DAY_NAMES[d.dayOfWeek], title: d.title,
      focus: d.focus, isRest: d.isRest, notes: d.notes,
      exercises: items.filter((i) => i.planDayId === d.id && dayIds.has(i.planDayId)).map((i) => ({
        slug: i.slug, name: i.name, notes: i.notes,
        target: `${i.sets}×${i.reps}${i.weightKg !== null ? ` @ ${weightOut(i.weightKg, units)}${weightLabel(units)}` : ""}`,
      })),
    })),
  };
}

export type MealWeekView = {
  exists: boolean; weekStart: ISODate; todayIndex: number;
  calorieTarget: number; proteinTargetG: number; rationale: string | null;
  days: {
    dayOfWeek: number; dayName: string; calories: number; proteinG: number;
    meals: {
      id: string; slot: string; title: string; calories: number; proteinG: number;
      prepMinutes: number | null; ingredients: string[]; steps: string[];
    }[];
  }[];
};

export async function mealWeekView(profileId: string, week = weekStart()): Promise<MealWeekView> {
  const [plan] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), eq(mealPlans.weekStart, week))).limit(1);
  if (!plan) {
    return { exists: false, weekStart: week, todayIndex: dayIndex(),
      calorieTarget: 0, proteinTargetG: 0, rationale: null, days: [] };
  }

  const rows = await db.select().from(meals)
    .where(eq(meals.mealPlanId, plan.id)).orderBy(asc(meals.dayOfWeek), asc(meals.sortOrder));

  return {
    exists: true, weekStart: week, todayIndex: dayIndex(),
    calorieTarget: plan.calorieTarget, proteinTargetG: plan.proteinTargetG,
    rationale: plan.rationale,
    days: DAY_NAMES.map((dayName, dow) => {
      const dayMeals = rows.filter((m) => m.dayOfWeek === dow);
      return {
        dayOfWeek: dow, dayName,
        calories: dayMeals.reduce((n, m) => n + m.calories, 0),
        proteinG: dayMeals.reduce((n, m) => n + m.proteinG, 0),
        meals: dayMeals.map((m) => ({
          id: m.id, slot: m.slot, title: m.title, calories: m.calories,
          proteinG: m.proteinG, prepMinutes: m.prepMinutes,
          ingredients: m.ingredients, steps: m.steps,
        })),
      };
    }),
  };
}

/**
 * Compact plan summary for the volatile half of the system prompt. Without it
 * the coach guesses at what a given day contains — and a guess it states as
 * fact is worse than no answer.
 */
export async function planSummary(profileId: string, units: Units): Promise<string> {
  const week = await weekView(profileId, units);
  if (!week.exists) return "This week's training plan: none yet.";

  const days = week.days
    .map((d) =>
      d.isRest
        // The dayOfWeek index is stated outright: every tool that edits a day
        // takes one, and making the model re-derive "Saturday = 5" is how it
        // came to edit the wrong day and then report the change as done.
        ? `  [dayOfWeek ${d.dayOfWeek}] ${d.dayName}: rest`
        : `  [dayOfWeek ${d.dayOfWeek}] ${d.dayName} (${d.title}): ${d.exercises.map((e) => `${e.name} ${e.target}`).join(", ") || "nothing set"}`,
    )
    .join("\n");
  return (
    `This week's PLANNED targets — "${week.title}". These are what she is scheduled to do, NOT what she has done; read her actual logged sets with get_exercise_history or get_week_review:\n${days}`
  );
}

export type PickableExercise = { slug: string; name: string; category: string };

/**
 * Movements she can actually perform, grouped for a picker.
 *
 * Loaded server-side with the page so choosing one is instant and needs no
 * search — the old panel made her type into a box to discover what existed,
 * and offered a toggle between "everything" and her first listed piece of kit,
 * which told her nothing useful.
 */
export async function pickableExercises(
  equipment: string[],
): Promise<{ group: string; items: PickableExercise[] }[]> {
  const rows = await db
    .select({
      slug: exercises.slug, name: exercises.name,
      category: exercises.category, equipment: exercises.equipment,
    })
    .from(exercises)
    .orderBy(asc(exercises.name));

  const hers = (equipment.length ? equipment : ["bodyweight"]).map((e) => e.toLowerCase());
  const hasGym = hers.some((h) => h.includes("full gym"));

  const usable = rows.filter((r) => {
    const needs = r.equipment.map((e) => e.toLowerCase());
    // Anything needing nothing but a body and a floor is always available.
    if (needs.every((n) => /bodyweight|mat|floor|wall|chair|outdoors|none/.test(n))) return true;
    if (hasGym) return true;
    return needs.some((n) =>
      hers.some((h) => n.includes(h.replace(/s$/, "")) || h.includes(n.replace(/s$/, ""))),
    );
  });

  const LABELS: Record<string, string> = {
    compound: "Compound", isolation: "Isolation", core: "Core",
    mobility: "Mobility", cardio: "Cardio",
  };
  const ORDER = ["compound", "isolation", "core", "cardio", "mobility"];

  return ORDER.flatMap((category) => {
    const items = usable
      .filter((r) => r.category === category)
      .map(({ slug, name, category }) => ({ slug, name, category }));
    return items.length ? [{ group: LABELS[category] ?? category, items }] : [];
  });
}

export type DayFoodView = {
  date: ISODate;
  logged: {
    id: string; slot: string; description: string;
    calories: number | null; proteinG: number | null; fibreG: number | null;
  }[];
  calories: number;
  proteinG: number;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  /** Grams from the entries that carry a figure — a floor when incomplete. */
  fibreG: number;
  fibreTargetG: number;
  /** False when any entry has no fibre figure, so the total is a floor. */
  fibreComplete: boolean;
};

/**
 * What she has actually eaten today, against the day's targets.
 *
 * Until this existed, meal_logs was written by the calculator and read by
 * nobody: she could log a meal and the app would show her nothing back. The
 * only way to see the day was to ask the coach.
 */
export async function dayFoodView(profileId: string, date: ISODate = today()): Promise<DayFoodView> {
  const rows = await db.select().from(mealLogs)
    .where(and(eq(mealLogs.profileId, profileId), eq(mealLogs.date, date)))
    .orderBy(asc(mealLogs.createdAt));

  const [plan] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), eq(mealPlans.weekStart, weekStart(date)))).limit(1);

  const fibre = fibreForDay(rows);
  return {
    date,
    logged: rows.map((r) => ({
      id: r.id, slot: r.slot, description: r.description,
      calories: r.calories, proteinG: r.proteinG, fibreG: r.fibreG,
    })),
    calories: rows.reduce((n, r) => n + (r.calories ?? 0), 0),
    proteinG: rows.reduce((n, r) => n + (r.proteinG ?? 0), 0),
    calorieTarget: plan?.calorieTarget ?? null,
    proteinTargetG: plan?.proteinTargetG ?? null,
    fibreG: fibre.grams,
    fibreTargetG: FIBRE_TARGET_G,
    fibreComplete: fibre.complete,
  };
}

export type RecentMeal = {
  slot: string;
  description: string;
  calories: number | null;
  proteinG: number | null;
  fibreG: number | null;
  /** How many times she has logged this in the window. */
  times: number;
  lastEaten: ISODate;
};

/**
 * Meals she logs often, most-repeated first.
 *
 * Food logging survives on how little it costs to do. She eats the same
 * breakfast most days, and retyping it every morning is the friction that ends
 * the habit — so the things she actually repeats are one tap.
 *
 * Grouped case-insensitively by slot and description, carrying the macros from
 * the most recent time she logged it, because that is the version she most
 * recently thought was right.
 */
export async function recentMeals(
  profileId: string,
  { windowDays = 30, limit = 6, from = today() }:
    { windowDays?: number; limit?: number; from?: ISODate } = {},
): Promise<RecentMeal[]> {
  const since = addDays(from, -windowDays);
  const rows = await db.select().from(mealLogs)
    .where(and(eq(mealLogs.profileId, profileId), gte(mealLogs.date, since)))
    .orderBy(desc(mealLogs.date), desc(mealLogs.createdAt));

  return groupRecentMeals(rows, limit);
}

/**
 * The grouping half of recentMeals, kept pure so the ordering assumption is
 * actually tested: rows must arrive newest first, because the first sighting of
 * a meal is what supplies its macros — the version she most recently thought
 * was right. Fed the other way round, it would quietly resurrect old numbers.
 */
export function groupRecentMeals(
  rows: { slot: string; description: string; calories: number | null; proteinG: number | null;
          fibreG: number | null; date: ISODate }[],
  limit = 6,
): RecentMeal[] {
  const grouped = new Map<string, RecentMeal>();
  for (const r of rows) {
    const key = `${r.slot}::${r.description.trim().toLowerCase()}`;
    const seen = grouped.get(key);
    if (seen) {
      seen.times += 1;
      continue;
    }
    grouped.set(key, {
      slot: r.slot, description: r.description,
      calories: r.calories, proteinG: r.proteinG, fibreG: r.fibreG,
      times: 1, lastEaten: r.date,
    });
  }

  return [...grouped.values()]
    .sort((a, b) => b.times - a.times || (a.lastEaten < b.lastEaten ? 1 : -1))
    .slice(0, limit);
}
