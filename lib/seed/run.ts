/**
 * Idempotent content seed: exercises and facts are reference data, upserted by
 * slug so re-running after editing the libraries updates rows in place.
 * Run with: npm run db:seed
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  exercises, facts, foods, mealTemplateItems, mealTemplates,
  workoutTemplateDays, workoutTemplateExercises, workoutTemplates,
} from "@/lib/db/schema";
import { EXERCISES } from "./exercises";
import { FACTS } from "./facts";
import { WORKOUT_TEMPLATES } from "./workout-templates";
import { MEAL_TEMPLATES } from "./meal-templates";
import { FOODS } from "./foods";
import { CHAIN_FOODS } from "./chain-foods";

async function main() {
  for (const e of EXERCISES) {
    const row = {
      slug: e.slug, name: e.name, category: e.category,
      primaryMuscles: e.primaryMuscles, equipment: e.equipment,
      tags: e.tags ?? [],
      formCues: e.formCues, commonMistakes: e.commonMistakes,
      safetyNote: e.safetyNote ?? null,
      easierAlternatives: e.easier ?? [], harderAlternatives: e.harder ?? [],
      unilateral: e.unilateral ?? false, bodyweight: e.bodyweight ?? false,
      isHold: e.isHold ?? false, met: e.met ?? null, requires: e.requires ?? null,
    };
    await db.insert(exercises).values(row)
      .onConflictDoUpdate({ target: exercises.slug, set: row });
  }
  console.log(`✓ ${EXERCISES.length} exercises`);

  for (const f of FACTS) {
    const row = { slug: f.slug, category: f.category, text: f.text, source: f.source ?? null, topic: f.topic ?? null };
    await db.insert(facts).values(row).onConflictDoUpdate({ target: facts.slug, set: row });
  }
  console.log(`✓ ${FACTS.length} facts`);

  // Templates are replaced wholesale rather than upserted: their days and
  // exercises are children, and editing a week in source should not leave
  // orphaned rows from the previous shape behind.
  for (const f of [...FOODS, ...CHAIN_FOODS]) {
    const row = {
      slug: f.slug, name: f.name, category: f.category,
      kcal: f.kcal, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG,
      fibreG: f.fibreG, unitGrams: f.unitGrams, unitLabel: f.unitLabel,
      aliases: f.aliases,
      // A restaurant row's figures are per item, not per 100g — see
      // `foods.per_item`. Everything in the generic library is by weight.
      perItem: f.perItem ?? false,
      brand: f.brand ?? null,
      // Seeded rows come from a table somebody already checked, so they are
      // stamped as audited and a re-seed corrects any estimate that had taken
      // the same slug. The audit queue is then exactly the model's guesses.
      estimated: false,
      auditedAt: new Date(),
      note: null,
    };
    await db.insert(foods).values(row)
      .onConflictDoUpdate({ target: foods.slug, set: row });
  }

  /*
    A row the seed no longer knows about is a row the seed takes away.

    Upserting alone leaves ghosts, and a ghost in this table is not inert: it
    keeps its aliases. One Timbit row at 80 kcal was split into the flavours
    the chain actually prints, and until this existed the old slug sat there
    still answering to "timbit" — so the correction shipped and the wrong
    number kept being found.

    Only `estimated: false` rows, which is exactly the set the seed writes.
    The model's cached guesses are the other half of this table and are not
    the seed's to delete — `remember()` in lib/tools/foods.ts puts them there,
    and a figure she has already logged a meal against must not vanish.
  */
  const seeded = [...FOODS, ...CHAIN_FOODS].map((f) => f.slug);
  const stale = await db.delete(foods)
    .where(and(eq(foods.estimated, false), notInArray(foods.slug, seeded)))
    .returning({ slug: foods.slug });
  /*
    And a guess the library can now answer itself.

    "A seeded row always wins, because the slug collides" is only true when the
    model named the food the way the seed did. It called one "pork chop"; the
    seed calls that `pork-loin-chop-cooked` and carries "pork chop" as an alias.
    No collision — so a guess at 210 kcal/100g with no per-item weight sat down
    beside the real row (231 kcal/100g, and it knows a chop is 120g) and
    *outranked* it, because an exact name match beats an exact alias match.

    Only an exact hit on a seeded name or alias. A guess for something the
    library genuinely does not have is the whole point of the cache and stays.

    `lib/tools/foods.ts` now refuses to write these in the first place; this is
    for the ones already there.
  */
  const known = new Set(
    [...FOODS, ...CHAIN_FOODS].flatMap((f) => [f.name, ...(f.aliases ?? [])])
      .map((n) => n.toLowerCase().trim()),
  );
  const guesses = await db.select({ id: foods.id, name: foods.name })
    .from(foods).where(eq(foods.estimated, true));
  const shadowing = guesses.filter((g) => known.has(g.name.toLowerCase().trim()));
  if (shadowing.length > 0) {
    await db.delete(foods).where(inArray(foods.id, shadowing.map((g) => g.id)));
  }

  console.log(`\u2713 ${FOODS.length} foods, ${CHAIN_FOODS.length} restaurant items`
    + (stale.length ? `, ${stale.length} retired (${stale.map((r) => r.slug).join(", ")})` : "")
    + (shadowing.length ? `, ${shadowing.length} shadowing guess(es) dropped (${shadowing.map((g) => g.name).join(", ")})` : ""));

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
