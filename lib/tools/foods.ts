import Anthropic from "@anthropic-ai/sdk";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { foods, mealPlans, mealTemplateItems, meals } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MODEL, PRICING } from "@/lib/agent/model";
import { checkSpendAllowed, recordUsage } from "@/lib/limits";
import { matchScore, parsePortion, toGrams } from "@/lib/portion";
import { foodUnitsFor } from "@/lib/profile";
import { foodLines, gramsLabel } from "@/lib/food-units";
import { defineTool, type ToolContext } from "./define";

/**
 * Calorie lookup: local table first, model only on a miss.
 *
 * The common case — "100g chicken breast" — is a single indexed query: instant,
 * free, and works with no signal. Falling back to the model costs a fraction of
 * a cent and only happens for something the library does not carry.
 */

let _client: Anthropic | undefined;
const anthropic = () => (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

const scale = (per100g: number, grams: number) => Math.round((per100g * grams) / 100 * 10) / 10;

export const lookupFood = defineTool({
  name: "lookup_food",
  description:
    "Calories and macros for a food and portion — '100g boiled egg', '2 eggs', '4oz salmon'. Checks the local library first and only estimates when it finds nothing, so prefer it over working the numbers out yourself. If she gives no amount it assumes 100g and says so. Read the portion back from `portion`, which is already in her food units.",
  input: z.object({
    query: z.string().describe("Food and portion as she said it, e.g. '150g cooked rice'"),
    allowEstimate: z.boolean().optional()
      .describe("Estimate with the model when the library has no match. Default true."),
  }),
  handler: async (input, ctx) => {
    const portion = parsePortion(input.query);
    if (!portion) return { error: "Nothing to look up." };

    const matches = await searchFoods(portion.query, 5);
    const best = matches[0];

    if (best) {
      const grams = toGrams(portion, best.unitGrams, best.unitLabel);
      if (grams === null) {
        return {
          found: true, food: best.name,
          error: `${best.name} has no per-item weight, so "${portion.amount} ${portion.unit}" can't be converted. Ask her for it in grams or ounces.`,
          per100g: {
          kcal: best.kcal, proteinG: best.proteinG,
          carbsG: best.carbsG, fatG: best.fatG, fibreG: best.fibreG,
        },
        };
      }
      return {
        found: true,
        source: "library",
        food: best.name,
        category: best.category,
        grams: Math.round(grams),
        // The portion as she'd say it — "3.5 oz" or "100 g". `grams` is what
        // the numbers were worked out on; this is the one to read back.
        portion: gramsLabel(grams, await foodUnitsFor(ctx.profileId)),
        assumed100g: portion.assumed,
        kcal: Math.round(scale(best.kcal, grams)),
        proteinG: scale(best.proteinG, grams),
        carbsG: scale(best.carbsG, grams),
        fatG: scale(best.fatG, grams),
        fibreG: best.fibreG === null ? null : scale(best.fibreG, grams),
        alternatives: matches.slice(1, 4).map((m) => m.name),
      };
    }

    if (input.allowEstimate === false) {
      return { found: false, error: `Nothing in the library matches "${portion.query}".` };
    }
    return estimate(input.query, ctx);
  },
});

export const searchFoodLibrary = defineTool({
  name: "search_food_library",
  description:
    "Browse the food library by name. Useful when she is not sure what something is called, or to offer her options.",
  input: z.object({ query: z.string(), limit: z.number().optional() }),
  handler: async (input) => {
    const rows = await searchFoods(input.query, input.limit ?? 15);
    return rows.map((r) => ({
      name: r.name, category: r.category,
      per100g: {
        kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG,
        fatG: r.fatG, fibreG: r.fibreG,
      },
      naturalUnit: r.unitGrams ? `${r.unitLabel} ≈ ${r.unitGrams}g` : null,
    }));
  },
});

/** Name and alias search, best match first. */
export async function searchFoods(query: string, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const rows = await db
    .select()
    .from(foods)
    .where(or(ilike(foods.name, `%${q}%`), sql`${foods.aliases}::text ilike ${`%${q}%`}`))
    .limit(limit * 4);

  // Rank in JS: SQL ordering can't express "closest to what she typed" without
  // a trigram index. matchScore is pure and tested — see lib/portion.ts.
  return rows
    .map((r) => ({ ...r, score: matchScore(q, r.name, r.aliases) }))
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length)
    .slice(0, limit);
}

const Estimate = z.object({
  food: z.string(),
  grams: z.number().describe("Grams the estimate is for"),
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fibreG: z.number().nullable().optional().describe("Grams of fibre, null if negligible"),
  category: z.enum([
    "meat", "fish", "dairy", "eggs", "grain", "legume", "vegetable",
    "fruit", "nut", "fat", "sauce", "drink", "snack", "prepared",
  ]).describe("Closest category"),
  note: z.string().optional(),
});

/** The fallback. Cheap, and only reached when the library has nothing. */
async function estimate(query: string, ctx: ToolContext) {
  try {
    // Gated before the call, like every other model call. This one was
    // recording its usage and checking nothing, and lookup_food is reachable
    // in a loop from /api/action — so it was the way past the daily cap.
    const budget = await checkSpendAllowed(ctx.profileId);
    if (!budget.allowed) return { found: false, error: budget.reason };

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        "You estimate nutrition. Give standard reference values for the food and portion described. " +
        "If the portion is unstated assume 100g. Be honest in the note when a food varies a lot by " +
        "preparation or brand — a confident number for something that ranges 2x is worse than a caveat.",
      tools: [{
        name: "emit_estimate",
        description: "Emit the estimate.",
        input_schema: z.toJSONSchema(Estimate, { target: "draft-7", io: "input" }) as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: "emit_estimate" },
      messages: [{ role: "user", content: query }],
    });

    await recordUsage(response.usage, "app", PRICING, ctx.profileId);

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const parsed = block && Estimate.safeParse(block.input);
    if (!parsed?.success) return { found: false, error: "Couldn't estimate that one." };

    return {
      found: true, source: "estimated", ...parsed.data,
      portion: gramsLabel(parsed.data.grams, await foodUnitsFor(ctx.profileId)),
    };
  } catch {
    return { found: false, error: "Couldn't estimate that one." };
  }
}

export const findRecipes = defineTool({
  name: "find_recipes",
  description:
    "Meals that use a given ingredient, drawn from her own week first and then the recipe library. Use it when she asks what to do with something she has, or when a lookup leaves her wondering what to cook. Everything returned is already portioned with calories and protein, so it fits her targets without further maths.",
  input: z.object({
    ingredient: z.string().describe("A food, e.g. 'chicken breast' or 'eggs'"),
    limit: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const term = input.ingredient.trim().toLowerCase();
    if (!term) return { recipes: [] };
    const limit = input.limit ?? 6;

    // Her own plan first: these are meals she has already been given, so
    // suggesting one is a nudge back toward the plan rather than away from it.
    const hers = await db
      .select({
        title: meals.title, calories: meals.calories, proteinG: meals.proteinG,
        prepMinutes: meals.prepMinutes, ingredients: meals.ingredients, steps: meals.steps,
        dayOfWeek: meals.dayOfWeek, slot: meals.slot,
      })
      .from(meals)
      .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
      .where(and(
        eq(mealPlans.profileId, ctx.profileId),
        sql`${meals.ingredients}::text ilike ${`%${term}%`}`,
      ))
      .limit(limit);

    const library = await db
      .select({
        title: mealTemplateItems.title, calories: mealTemplateItems.calories,
        proteinG: mealTemplateItems.proteinG, prepMinutes: mealTemplateItems.prepMinutes,
        ingredients: mealTemplateItems.ingredients, steps: mealTemplateItems.steps,
        slot: mealTemplateItems.slot,
      })
      .from(mealTemplateItems)
      .where(sql`${mealTemplateItems.ingredients}::text ilike ${`%${term}%`}`)
      .limit(limit * 3);

    // The library repeats titles across templates; one of each is enough.
    const seen = new Set(hers.map((h) => h.title.toLowerCase()));
    const extra = library.filter((r) => {
      const key = r.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const fu = await foodUnitsFor(ctx.profileId);
    const shape = (r: {
      title: string; calories: number; proteinG: number; prepMinutes: number | null;
      ingredients: string[]; steps: string[]; slot: string;
    }, onPlan: boolean) => ({
      title: r.title, slot: r.slot, onHerPlan: onPlan,
      calories: r.calories, proteinG: r.proteinG, prepMinutes: r.prepMinutes,
      ingredients: foodLines(r.ingredients, fu), steps: foodLines(r.steps, fu),
    });

    return {
      foodUnits: fu,
      recipes: [
        ...hers.map((r) => shape(r, true)),
        ...extra.slice(0, Math.max(0, limit - hers.length)).map((r) => shape(r, false)),
      ],
    };
  },
});
