import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, mealPlans, meals, planDays, planExercises, plans, setLogs, workouts,
} from "@/lib/db/schema";
import { DAY_NAMES, dayIndex, today, weekStart, type ISODate } from "@/lib/date";
import { weightLabel, weightOut, type Units } from "@/lib/units";
import { lastTimeTargets } from "@/lib/progress";

/**
 * Read models for the screens. Pages render from these; mutations always go
 * back through the tool registry, so there's exactly one write path.
 */
export type TodayExercise = {
  slug: string; name: string; bodyweight: boolean;
  targetSets: number; targetReps: number; targetWeight: number | null;
  restSeconds: number; notes: string | null;
  lastTime: { date: ISODate; sets: { reps: number; weight: number | null }[] } | null;
  loggedToday: { setNumber: number; reps: number; weight: number | null }[];
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
    bodyweight: exercises.bodyweight,
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
  const lastTime = await lastTimeTargets(profileId, items.map((i) => i.exerciseId), date);

  return {
    ...base,
    hasPlan: true,
    title: day.title, focus: day.focus, isRest: day.isRest, notes: day.notes,
    completed: workout?.completedAt != null,
    exercises: items.map((i) => {
      const prev = lastTime.get(i.exerciseId);
      return {
        slug: i.slug, name: i.name, bodyweight: i.bodyweight,
        targetSets: i.targetSets, targetReps: i.targetReps,
        targetWeight: weightOut(i.targetWeightKg, units),
        restSeconds: i.restSeconds, notes: i.notes,
        lastTime: prev
          ? { date: prev.date, sets: prev.sets.map((s) => ({ reps: s.reps, weight: weightOut(s.weightKg, units) })) }
          : null,
        loggedToday: logged.filter((l) => l.exerciseId === i.exerciseId)
          .map((l) => ({ setNumber: l.setNumber, reps: l.reps, weight: weightOut(l.weightKg, units) })),
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
