import { parsePortion, toGrams } from "@/lib/portion";
import { searchFoods } from "@/lib/tools/foods";

/**
 * A recipe's fibre, worked out from its ingredient lines.
 *
 * The recipe library carries calories, protein, carbs and fat and has never
 * carried fibre — which is why the idea cards showed two numbers and the fifth
 * macro was simply absent. It is recoverable: an ingredient line is a portion
 * and a food, both of which the calculator already resolves, and the foods
 * table has fibre per 100g.
 *
 * What it is not is free, so nothing calls this twice for the same recipe:
 * `suggest_meals` writes the answer back onto the row the first time it is
 * asked for, and the library is global, so it converges after one shuffle.
 *
 * Unknown is not zero, the usual way: `lines` is how many ingredients actually
 * resolved, and a recipe with fewer than it has ingredients reports a *floor*.
 */
export type MealFibre = { grams: number; lines: number };

/**
 * Categories where a null fibre figure means none, rather than unmeasured.
 *
 * 172 of the seeded foods have `fibre_g` null and almost all of them are meat,
 * fish, dairy, eggs, oil or water — foods with no fibre by construction, where
 * the column was left empty rather than written 0. Reading those as unknown
 * would make nearly every recipe in the library a floor, and the "≥" would
 * stop meaning anything. Everything else keeps the honest reading: a legume or
 * a fruit with no figure is a figure nobody has.
 */
const NONE_BY_NATURE = new Set(["meat", "fish", "dairy", "eggs", "fat", "drink"]);

/**
 * A food's fibre per 100g, or null where nobody has measured it.
 *
 * Pure, and separate from the lookup, because this is the judgement call in
 * the whole file: an empty column means two different things depending on what
 * the food is.
 */
export function fibrePer100(food: { fibreG: number | null; category: string }): number | null {
  if (food.fibreG !== null) return food.fibreG;
  return NONE_BY_NATURE.has(food.category) ? 0 : null;
}

/** Grams of fibre in one ingredient line, or null if it could not be resolved. */
export async function fibreForLine(line: string): Promise<number | null> {
  const portion = parsePortion(line);
  if (!portion) return null;

  const [best] = await searchFoods(portion.query, 1);
  if (!best) return null;

  // Same rule as lookup_food: no amount means one of the thing, and 100g only
  // where the food has no natural unit.
  const grams = portion.assumed && best.unitGrams !== null
    ? best.unitGrams
    : toGrams(portion, best.unitGrams, best.unitLabel);
  if (grams === null || !Number.isFinite(grams)) return null;

  const per100 = fibrePer100(best);
  return per100 === null ? null : (per100 / 100) * grams;
}

/** A whole recipe's fibre, and how many of its lines are behind the number. */
export async function fibreForRecipe(ingredients: string[]): Promise<MealFibre> {
  const each = await Promise.all(ingredients.map((l) => fibreForLine(l)));
  const known = each.filter((g): g is number => g !== null);
  return {
    grams: Math.round(known.reduce((n, g) => n + g, 0) * 10) / 10,
    lines: known.length,
  };
}

/**
 * How to write it: "12g" when every line is accounted for, "≥12g" when not,
 * and null when nothing resolved at all — a dash on the card is honest, a 0 is
 * a claim the recipe has no fibre.
 */
export function formatFibre(
  grams: number | null, lines: number | null, of: number,
): string | null {
  if (grams === null || lines === null || lines === 0) return null;
  return `${lines < of ? "≥" : ""}${Math.round(grams)}g`;
}
