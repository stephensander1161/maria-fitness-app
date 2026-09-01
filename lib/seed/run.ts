/**
 * Idempotent content seed: exercises and facts are reference data, upserted by
 * slug so re-running after editing the libraries updates rows in place.
 * Run with: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, facts, mealTemplateItems, mealTemplates,
  workoutTemplateDays, workoutTemplateExercises, workoutTemplates,
} from "@/lib/db/schema";
import { EXERCISES } from "./exercises";
import { FACTS } from "./facts";
import { WORKOUT_TEMPLATES } from "./workout-templates";
import { MEAL_TEMPLATES } from "./meal-templates";

async function main() {
  for (const e of EXERCISES) {
    const row = {
      slug: e.slug, name: e.name, category: e.category,
      primaryMuscles: e.primaryMuscles, equipment: e.equipment,
      formCues: e.formCues, commonMistakes: e.commonMistakes,
      safetyNote: e.safetyNote ?? null,
      easierAlternatives: e.easier ?? [], harderAlternatives: e.harder ?? [],
      unilateral: e.unilateral ?? false, bodyweight: e.bodyweight ?? false,
    };
    await db.insert(exercises).values(row)
      .onConflictDoUpdate({ target: exercises.slug, set: row });
  }
  console.log(`✓ ${EXERCISES.length} exercises`);

  for (const f of FACTS) {
    const row = { slug: f.slug, category: f.category, text: f.text, source: f.source ?? null };
    await db.insert(facts).values(row).onConflictDoUpdate({ target: facts.slug, set: row });
  }
  console.log(`✓ ${FACTS.length} facts`);

  // Templates are replaced wholesale rather than upserted: their days and
  // exercises are children, and editing a week in source should not leave
  // orphaned rows from the previous shape behind.
  for (const t of WORKOUT_TEMPLATES) {
    const row = {
      slug: t.slug, name: t.name, description: t.description,
      daysPerWeek: t.daysPerWeek, equipment: t.equipment, experience: t.experience,
      avoids: t.avoids ?? [], sessionMinutes: t.sessionMinutes,
    };
    const [saved] = await db.insert(workoutTemplates).values(row)
      .onConflictDoUpdate({ target: workoutTemplates.slug, set: row }).returning();

    await db.delete(workoutTemplateDays).where(eq(workoutTemplateDays.templateId, saved.id));
    for (const day of t.days) {
      const [savedDay] = await db.insert(workoutTemplateDays).values({
        templateId: saved.id, dayOfWeek: day.dayOfWeek, title: day.title,
        focus: day.focus ?? null, isRest: day.isRest ?? false, notes: day.notes ?? null,
      }).returning();

      const list = day.exercises ?? [];
      if (list.length) {
        await db.insert(workoutTemplateExercises).values(list.map((e, i) => ({
          templateDayId: savedDay.id, exerciseSlug: e.exerciseSlug, sortOrder: i,
          sets: e.sets, reps: e.reps, restSeconds: e.restSeconds ?? 90, notes: e.notes ?? null,
        })));
      }
    }
  }
  console.log(`✓ ${WORKOUT_TEMPLATES.length} workout templates`);

  for (const t of MEAL_TEMPLATES) {
    const row = {
      slug: t.slug, name: t.name, description: t.description,
      baseCalories: t.baseCalories, baseProteinG: t.baseProteinG,
      dietaryTags: t.dietaryTags ?? [], cookingSkill: t.cookingSkill,
      contains: t.contains ?? [],
    };
    const [saved] = await db.insert(mealTemplates).values(row)
      .onConflictDoUpdate({ target: mealTemplates.slug, set: row }).returning();

    await db.delete(mealTemplateItems).where(eq(mealTemplateItems.templateId, saved.id));
    await db.insert(mealTemplateItems).values(t.meals.map((m, i) => ({
      templateId: saved.id, dayOfWeek: m.dayOfWeek, slot: m.slot, title: m.title,
      calories: m.calories, proteinG: m.proteinG,
      carbsG: m.carbsG ?? null, fatG: m.fatG ?? null,
      ingredients: m.ingredients ?? [], steps: m.steps ?? [],
      prepMinutes: m.prepMinutes ?? null, sortOrder: m.sortOrder ?? i,
    })));
  }
  console.log(`✓ ${MEAL_TEMPLATES.length} meal templates`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
