import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { exercises, mealTemplateItems, mealTemplates, profiles } from "@/lib/db/schema";
import { owns } from "@/lib/templates";
import { foodUnitsFor } from "@/lib/profile";
import { foodLines } from "@/lib/food-units";
import { fibreForRecipe, formatFibre } from "@/lib/meal-fibre";
import { defineTool } from "./define";

/**
 * Ideas, as opposed to plans.
 *
 * Both of these draw from the seeded libraries rather than asking a model:
 * 106 distinct meals and 159 movements is plenty to be surprised by, it
 * answers instantly, and it costs nothing — which matters, because the whole
 * point of a shuffle is that she presses it repeatedly.
 *
 * Both filter to what actually fits her before shuffling. A vegetarian being
 * offered steak, or someone with a floor and no bench being shown a bench
 * press, is not inspiration; it is noise she has to sort through.
 */

const slotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const suggestMeals = defineTool({
  name: "suggest_meals",
  description:
    "Meal ideas she could actually eat, drawn at random from the recipe library and already filtered to her restrictions and dislikes. Use it when she wants something different, cannot decide, or asks what else there is — and pass one straight to swap_meal if she likes it. Costs nothing and answers instantly, so offer freely.",
  input: z.object({
    slot: slotEnum.optional().describe("Limit to one meal of the day"),
    nearCalories: z.number().optional().describe("Prefer meals close to this, e.g. the slot she is replacing"),
    limit: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ideas: [] };

    const restrictions = profile.dietaryRestrictions.map((r) => r.toLowerCase());
    const dislikes = profile.dislikedFoods.map((d) => d.toLowerCase()).filter(Boolean);

    const templates = await db.select().from(mealTemplates);
    const allowed = templates
      .filter((t) => {
        const tags = t.dietaryTags.map((x) => x.toLowerCase());
        return restrictions.every((r) => tags.includes(r));
      })
      .map((t) => t.id);
    if (allowed.length === 0) return { ideas: [], hint: "Her restrictions rule out every recipe in the library." };

    const filters = [inArray(mealTemplateItems.templateId, allowed)];
    if (input.slot) filters.push(eq(mealTemplateItems.slot, input.slot));

    const rows = await db.select().from(mealTemplateItems)
      .where(and(...filters))
      .orderBy(sql`random()`)
      .limit(60);

    const limit = Math.min(12, Math.max(1, input.limit ?? 5));
    const fu = await foodUnitsFor(ctx.profileId);
    const seen = new Set<string>();
    const picked = rows
      // A meal built around something she will not eat is not an idea.
      .filter((m) => !dislikes.some((d) => m.ingredients.some((i) => i.toLowerCase().includes(d))))
      .filter((m) => {
        const key = m.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) =>
        input.nearCalories === undefined
          ? 0
          : Math.abs(a.calories - input.nearCalories) - Math.abs(b.calories - input.nearCalories),
      )
      .slice(0, limit);

    /*
      Fibre, the one macro the recipe library never carried.

      Worked out from the ingredient lines the first time a recipe is asked
      for and written back onto the row, so the second shuffle — anyone's, the
      table is global — pays nothing. Computed off the metric ingredients,
      before they are rewritten into her units.
    */
    const withFibre = await Promise.all(picked.map(async (m) => {
      if (m.fibreLines !== null) return m;
      const f = await fibreForRecipe(m.ingredients);
      await db.update(mealTemplateItems)
        .set({ fibreG: f.grams, fibreLines: f.lines })
        // Only if nobody got there first: the first answer stands, the same
        // way a saved estimate does.
        .where(and(eq(mealTemplateItems.id, m.id), isNull(mealTemplateItems.fibreLines)))
        .catch(() => { /* a card without fibre beats a failed shuffle */ });
      return { ...m, fibreG: f.grams, fibreLines: f.lines };
    }));

    const ideas = withFibre.map((m) => ({
      title: m.title, slot: m.slot,
      calories: m.calories, proteinG: m.proteinG,
      carbsG: m.carbsG, fatG: m.fatG, prepMinutes: m.prepMinutes,
      // A floor when fewer lines resolved than the recipe has — `fibre` is the
      // one to read back, `fibreG` the one to do arithmetic on.
      fibreG: m.fibreG, fibreLines: m.fibreLines,
      fibre: formatFibre(m.fibreG, m.fibreLines, m.ingredients.length),
      ingredients: foodLines(m.ingredients, fu), steps: foodLines(m.steps, fu),
    }));

    return { ideas, foodUnits: fu, hint: "Pass one to swap_meal with the id of the meal it replaces." };
  },
});

export const suggestExercises = defineTool({
  name: "suggest_exercises",
  description:
    "Movement ideas she can actually perform, drawn at random from the library and filtered to the equipment she owns. Pass a category for a particular kind — 'mobility' for stretches and physiotherapy work — or a tag like 'postpartum', 'physio', 'back pain' or 'desk' for a complaint. Hand one to add_exercise_to_day if she wants it.",
  input: z.object({
    category: z.enum(["compound", "isolation", "cardio", "mobility", "core"]).optional(),
    tag: z.string().optional().describe("A complaint or theme — 'postpartum', 'physio', 'knee', 'desk'"),
    limit: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    const hers = profile?.equipment.length ? profile.equipment : ["bodyweight"];

    const filters = [];
    if (input.category) filters.push(eq(exercises.category, input.category));
    if (input.tag) filters.push(sql`${exercises.tags}::text ilike ${`%${input.tag}%`}`);

    const rows = await db.select().from(exercises)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(sql`random()`)
      .limit(80);

    const limit = Math.min(12, Math.max(1, input.limit ?? 5));
    const ideas = rows
      // Every piece of kit it needs, she must have — the same rule the
      // template picker uses, for the same reason.
      .filter((e) => e.equipment.every((kit) => owns(hers, kit)))
      .slice(0, limit)
      .map((e) => ({
        slug: e.slug, name: e.name, category: e.category,
        primaryMuscles: e.primaryMuscles, equipment: e.equipment,
        bodyweight: e.bodyweight, tags: e.tags,
        // The one line worth reading before trying something new.
        safetyNote: e.safetyNote,
      }));

    return { ideas, hint: "Pass a slug to add_exercise_to_day, or to get_exercise_guide for the full form notes." };
  },
});
