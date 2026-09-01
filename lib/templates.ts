import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, mealTemplateItems, mealTemplates, meals, mealPlans,
  planDays, planExercises, plans,
  workoutTemplateDays, workoutTemplateExercises, workoutTemplates,
  type MealTemplate, type Profile, type WorkoutTemplate,
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

/**
 * Things nobody has to own. Templates list everything a week touches, including
 * a floor to lie on — requiring her to have declared "mat" would reject every
 * template she could actually do.
 */
const ASSUMED = ["bodyweight", "mat", "floor", "chair", "wall", "outdoors", "none"];

/** Loose match: "dumbbells" should satisfy a template asking for "dumbbell". */
const owns = (hers: string[], needed: string) => {
  const want = needed.toLowerCase().replace(/s$/, "");
  if (ASSUMED.some((a) => want.includes(a))) return true;
  return hers.some((h) => {
    const have = h.toLowerCase();
    // A full gym covers anything a template can ask for.
    if (have.includes("full gym")) return true;
    return have.includes(want) || want.includes(have.replace(/s$/, ""));
  });
};

/** What a template is worth to her, higher is better. Pure so the selection
 *  matrix — the thing every new user gets on day one — can be tested. */
export function scoreWorkoutTemplate(
  t: Pick<WorkoutTemplate, "equipment" | "experience" | "avoids" | "daysPerWeek" | "sessionMinutes">,
  profile: Pick<Profile, "equipment" | "injuries" | "experience" | "daysPerWeek" | "sessionMinutes">,
): number {
  const hers = profile.equipment.length ? profile.equipment : ["bodyweight"];
  const injuries = profile.injuries.map((i) => i.toLowerCase());
  let score = 0;

  // Days a week is the constraint she actually feels; weight it highest.
  const dayGap = Math.abs((profile.daysPerWeek ?? 3) - t.daysPerWeek);
  score += dayGap === 0 ? 12 : dayGap === 1 ? 6 : 0;

  // Every piece of kit it needs, she must have. This is disqualifying, not a
  // penalty: it used to subtract 20, which the day, experience and session
  // bonuses together (+23) could outweigh — leaving a template she physically
  // cannot perform sitting on a positive score and eligible to be chosen.
  if (!t.equipment.every((e) => owns(hers, e))) return -Infinity;
  score += 10;

  // Then prefer the one that actually uses what she owns. Without this, a
  // bodyweight week ties with a band week for someone who has bands — both
  // are performable — and the tie broke on array order.
  const specific = t.equipment.filter(
    (e) => !ASSUMED.some((a) => e.toLowerCase().includes(a)),
  );
  score += specific.filter((e) => owns(hers, e)).length * 3;

  if (profile.experience && t.experience.includes(profile.experience)) score += 5;

  // A template built to avoid what actually hurts her is worth a lot.
  const relevant = t.avoids.filter((a) => injuries.some((i) => i.includes(a.toLowerCase())));
  score += relevant.length * 8;

  // And a template that avoids something she has no reason to avoid is worth
  // slightly less than a general one. A restricted week is a narrower week:
  // the knee-friendly plan leaves out squats and lunges on purpose, which is
  // right for a bad knee and a quiet loss for anyone else. Small, so it only
  // breaks ties — when it is the only week she can actually perform, it
  // should still win.
  if (t.avoids.length > 0 && relevant.length === 0) score -= 2;

  if (profile.sessionMinutes && Math.abs(profile.sessionMinutes - t.sessionMinutes) <= 15) score += 3;

  return score;
}

export async function pickWorkoutTemplate(profile: Profile) {
  // Ordered for the same reason as the meal templates: ties must not be
  // broken by whatever order Postgres happens to return rows in.
  const all = await db.select().from(workoutTemplates).orderBy(workoutTemplates.slug);
  if (all.length === 0) return null;

  const scored = all
    .map((t) => ({ template: t, score: scoreWorkoutTemplate(t, profile) }))
    .sort((a, b) => b.score - a.score);

  return scored[0].score > 0 ? scored[0].template : null;
}


/**
 * Tags that describe a way of eating she has to opt into. A template carrying
 * one of these is a narrower week for someone who did not ask for it — the
 * same reasoning as the knee-friendly training plan. "high-protein" is not
 * here: it is a style, not a restriction, and it suits a deficit.
 */
const RESTRICTIVE_TAGS = [
  "vegetarian", "vegan", "pescatarian", "dairy-free", "gluten-free", "halal", "kosher",
];

/** What a meal template is worth to her. Pure, so the choice can be tested. */
export function scoreMealTemplate(
  t: Pick<MealTemplate, "dietaryTags" | "contains" | "baseCalories" | "cookingSkill">,
  profile: Pick<Profile, "dietaryRestrictions" | "dislikedFoods" | "cookingSkill">,
  calorieTarget: number,
): number {
  const restrictions = profile.dietaryRestrictions.map((r) => r.toLowerCase());
  const dislikes = profile.dislikedFoods.map((d) => d.toLowerCase()).filter(Boolean);
  const tags = t.dietaryTags.map((x) => x.toLowerCase());

  // Every restriction she has must be satisfied, and a week built around
  // something she will not eat is not a starting point. Both disqualifying.
  if (!restrictions.every((r) => tags.includes(r))) return -Infinity;
  if (dislikes.some((d) => t.contains.some((c) => c.toLowerCase().includes(d)))) return -Infinity;

  // Closeness to her calorie target, in units of 50 kcal.
  let score = -Math.abs(t.baseCalories - calorieTarget) / 50;

  // A week she is willing to cook beats a better one she is not.
  if (profile.cookingSkill && t.cookingSkill === profile.cookingSkill) score += 3;

  // Don't hand a vegetarian week to someone who eats meat.
  const unasked = tags.filter((x) => RESTRICTIVE_TAGS.includes(x) && !restrictions.includes(x));
  score -= unasked.length * 4;

  return score;
}

export async function pickMealTemplate(profile: Profile, calorieTarget: number) {
  // Ordered: without it, templates that score the same are separated by
  // physical row order, so reseeding could quietly change which week she gets.
  const all = await db.select().from(mealTemplates).orderBy(mealTemplates.slug);
  if (all.length === 0) return null;

  const scored = all
    .map((t) => ({ t, score: scoreMealTemplate(t, profile, calorieTarget) }))
    .sort((a, b) => b.score - a.score);

  // Everything disqualified means her restrictions rule out the whole library;
  // the closest week is a better answer than none, and the coach adapts it.
  if (scored[0].score === -Infinity) {
    return all.reduce((best, t) =>
      Math.abs(t.baseCalories - calorieTarget) < Math.abs(best.baseCalories - calorieTarget) ? t : best,
    );
  }
  return scored[0].t;
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
