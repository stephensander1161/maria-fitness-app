import Anthropic from "@anthropic-ai/sdk";
import { ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { foods } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MODEL, PRICING } from "@/lib/agent/model";
import { recordUsage } from "@/lib/limits";
import { parsePortion, toGrams } from "@/lib/portion";
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
    "Calories and macros for a food and portion — '100g boiled egg', '2 eggs', '4oz salmon'. Checks the local library first and only estimates when it finds nothing, so prefer it over working the numbers out yourself. If she gives no amount it assumes 100g and says so.",
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
      const grams = toGrams(portion, best.unitGrams);
      if (grams === null) {
        return {
          found: true, food: best.name,
          error: `${best.name} has no per-item weight, so "${portion.amount} ${portion.unit}" can't be converted. Ask her for it in grams or ounces.`,
          per100g: { kcal: best.kcal, proteinG: best.proteinG, carbsG: best.carbsG, fatG: best.fatG },
        };
      }
      return {
        found: true,
        source: "library",
        food: best.name,
        grams: Math.round(grams),
        assumed100g: portion.assumed,
        kcal: Math.round(scale(best.kcal, grams)),
        proteinG: scale(best.proteinG, grams),
        carbsG: scale(best.carbsG, grams),
        fatG: scale(best.fatG, grams),
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
      per100g: { kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG },
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

  // Rank in JS: an exact name beats a prefix, which beats a substring. SQL
  // ordering can't express "closest to what she typed" without a trigram index.
  return rows
    .map((r) => {
      const name = r.name.toLowerCase();
      const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
      return { ...r, score };
    })
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length)
    .slice(0, limit);
}

const Estimate = z.object({
  food: z.string(),
  grams: z.number(),
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  note: z.string().optional(),
});

/** The fallback. Cheap, and only reached when the library has nothing. */
async function estimate(query: string, ctx: ToolContext) {
  try {
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

    return { found: true, source: "estimated", ...parsed.data };
  } catch {
    return { found: false, error: "Couldn't estimate that one." };
  }
}
