import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, mealTemplateItems, mealTemplates, meals, mealPlans,
  planDays, planExercises, plans,
  workoutTemplateDays, workoutTemplateExercises, workoutTemplates,
  type Profile,
} from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/**
 * Choosing and instantiating a ready-made week.
 *
 * Onboarding used to wait ~45 seconds on a model call, and produced nothing at
 * all when that call came back malformed. Picking a template is instant, free,
 * and cannot fail — the coach then personalises it, which is a better use of it
 * than drafting from scratch.
 */

/** Loose match: "dumbbells" should satisfy a template asking for "dumbbell". */
const owns = (hers: string[], needed: string) => {
  const want = needed.toLowerCase().replace(/s$/, "");
  return hers.some((h) => {
    const have = h.toLowerCase();
    return have.includes(want) || want.includes(have.replace(/s$/, "")) || have.includes("full gym");
  });
};

export async function pickWorkoutTemplate(profile: Profile) {
  const all = await db.select().from(workoutTemplates);
  if (all.length === 0) return null;

  const hers = profile.equipment.length ? profile.equipment : ["bodyweight"];
  const injuries = profile.injuries.map((i) => i.toLowerCase());

  const scored = all.map((t) => {
    let score = 0;

    // Days a week is the constraint she actually feels; weight it highest.
    const dayGap = Math.abs((profile.daysPerWeek ?? 3) - t.daysPerWeek);
    score += dayGap === 0 ? 12 : dayGap === 1 ? 6 : 0;

    // Every piece of kit it needs, she must have. A template she can't perform
    // is worse than a simpler one she can.
    const usable = t.equipment.every((e) => owns(hers, e) || e.toLowerCase().includes("bodyweight"));
    score += usable ? 10 : -20;

    if (profile.experience && t.experience.includes(profile.experience)) score += 5;

    // A template built to avoid what actually hurts her is worth a lot.
    const relevant = t.avoids.filter((a) => injuries.some((i) => i.includes(a.toLowerCase())));
    score += relevant.length * 8;

    if (profile.sessionMinutes && Math.abs(profile.sessionMinutes - t.sessionMinutes) <= 15) score += 3;

    return { template: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].template : null;
}

export async function pickMealTemplate(profile: Profile, calorieTarget: number) {
  const all = await db.select().from(mealTemplates);
  if (all.length === 0) return null;

  const restrictions = profile.dietaryRestrictions.map((r) => r.toLowerCase());
  const dislikes = profile.dislikedFoods.map((d) => d.toLowerCase()).filter(Boolean);

  const eligible = all.filter((t) => {
    const tags = t.dietaryTags.map((x) => x.toLowerCase());
    // Every restriction she has must be satisfied by the template.
    const satisfies = restrictions.every((r) => tags.includes(r));
    // A template built around something she won't eat is not a starting point.
    const clashes = dislikes.some((d) => t.contains.some((c) => c.toLowerCase().includes(d)));
    return satisfies && !clashes;
  });

  const pool = eligible.length ? eligible : all;
  return pool.reduce((best, t) =>
    Math.abs(t.baseCalories - calorieTarget) < Math.abs(best.baseCalories - calorieTarget) ? t : best,
  );
}

export async function instantiateWorkoutPlan(
  profileId: string,
  template: typeof workoutTemplates.$inferSelect,
  weekStart: ISODate,
) {
  const days = await db.select().from(workoutTemplateDays)
    .where(eq(workoutTemplateDays.templateId, template.id))
    .orderBy(workoutTemplateDays.dayOfWeek);

  const items = days.length
    ? await db.select().from(workoutTemplateExercises)
        .where(inArray(workoutTemplateExercises.templateDayId, days.map((d) => d.id)))
        .orderBy(workoutTemplateExercises.sortOrder)
    : [];

  // Resolve slugs once. A template referencing a movement that no longer exists
  // should drop that line, not fail her whole first week.
  const slugs = [...new Set(items.map((i) => i.exerciseSlug))];
  const found = slugs.length
    ? await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)
        .where(inArray(exercises.slug, slugs))
    : [];
  const bySlug = new Map(found.map((e) => [e.slug, e.id]));
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) console.error("[templates] unknown slugs in", template.slug, missing);

  const [plan] = await db.insert(plans).values({
    profileId, weekStart,
    title: template.name,
    rationale: template.description,
  }).onConflictDoUpdate({
    target: [plans.profileId, plans.weekStart],
    set: { title: template.name, rationale: template.description },
  }).returning();

  await db.delete(planDays).where(eq(planDays.planId, plan.id));

  for (const day of days) {
    const [created] = await db.insert(planDays).values({
      planId: plan.id, dayOfWeek: day.dayOfWeek, title: day.title,
      focus: day.focus, isRest: day.isRest, notes: day.notes,
    }).returning();

    const forDay = items.filter((i) => i.templateDayId === day.id && bySlug.has(i.exerciseSlug));
    if (forDay.length) {
      await db.insert(planExercises).values(forDay.map((i, order) => ({
        planDayId: created.id,
        exerciseId: bySlug.get(i.exerciseSlug)!,
        sortOrder: order,
        targetSets: i.sets,
        targetReps: i.reps,
        // Left null on purpose: her working weight comes from what she lifts,
        // not from a guess in a template.
        targetWeightKg: null,
        restSeconds: i.restSeconds,
        notes: i.notes,
      })));
    }
  }
  return plan;
}

export async function instantiateMealPlan(
  profileId: string,
  template: typeof mealTemplates.$inferSelect,
  weekStart: ISODate,
  calorieTarget: number,
  proteinTargetG: number,
) {
  const items = await db.select().from(mealTemplateItems)
    .where(eq(mealTemplateItems.templateId, template.id))
    .orderBy(mealTemplateItems.dayOfWeek, mealTemplateItems.sortOrder);

  // Portions scale to her actual target rather than shipping someone else's
  // calorie level. Crude but honest for a starting point, and the coach adjusts.
  const scale = template.baseCalories > 0 ? calorieTarget / template.baseCalories : 1;
  const round5 = (n: number) => Math.round(n / 5) * 5;

  const [plan] = await db.insert(mealPlans).values({
    profileId, weekStart, calorieTarget, proteinTargetG,
    rationale: template.description,
  }).onConflictDoUpdate({
    target: [mealPlans.profileId, mealPlans.weekStart],
    set: { calorieTarget, proteinTargetG, rationale: template.description },
  }).returning();

  await db.delete(meals).where(eq(meals.mealPlanId, plan.id));

  if (items.length) {
    await db.insert(meals).values(items.map((m, i) => ({
      mealPlanId: plan.id,
      dayOfWeek: m.dayOfWeek,
      slot: m.slot,
      title: m.title,
      calories: round5(m.calories * scale),
      proteinG: Math.round(m.proteinG * scale),
      carbsG: m.carbsG === null ? null : Math.round(m.carbsG * scale),
      fatG: m.fatG === null ? null : Math.round(m.fatG * scale),
      ingredients: m.ingredients,
      steps: m.steps,
      prepMinutes: m.prepMinutes,
      sortOrder: i,
    })));
  }
  return plan;
}
