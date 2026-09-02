/**
 * The week's ingredients, added up and grouped by aisle.
 *
 * A read model, not a tool: the tool that reads the list back, the one that
 * sends it to Instacart, the one that puts the shopping away, and the kitchen
 * screen all shop from this same list. It lives outside lib/tools/ so that
 * none of them has to import another.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { foods, mealPlans, meals, shoppingExtras } from "@/lib/db/schema";
import { weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { aggregateIngredients, type ShoppingItem } from "@/lib/shopping";

/**
 * The food library, cached per process.
 *
 * It is seeded reference data that changes when someone runs a seed script,
 * and the Plan screen loads it twice per render — once for the list, once for
 * the kitchen — then again on every coach turn that touches food. Four hundred
 * rows is not much, but fetching them on every one of those was work nobody
 * needed. Five minutes is short enough that a reseed shows up without a
 * redeploy.
 */
let _labels: { at: number; rows: { name: string; category: string; aliases: string[] }[] } | null = null;
const LABELS_TTL_MS = 5 * 60 * 1000;

async function foodLabels() {
  if (_labels && Date.now() - _labels.at < LABELS_TTL_MS) return _labels.rows;
  const rows = await db.select({
    name: foods.name, category: foods.category, aliases: foods.aliases,
  }).from(foods);
  _labels = { at: Date.now(), rows };
  return rows;
}

/** Supermarket order, roughly. Anything unmatched falls to the end. */
const AISLES: Record<string, string> = {
  vegetable: "Fruit & veg", fruit: "Fruit & veg",
  meat: "Meat & fish", fish: "Meat & fish",
  dairy: "Dairy & eggs", eggs: "Dairy & eggs",
  grain: "Cupboard", legume: "Cupboard", nut: "Cupboard",
  fat: "Cupboard", sauce: "Cupboard",
  drink: "Drinks", snack: "Snacks", prepared: "Chilled & frozen",
};

export type ShoppingList =
  | { exists: false; weekStart: string }
  | { exists: true; weekStart: string; mealsCovered: number; aisles: { aisle: string; items: ShoppingItem[] }[] };

/**
 * The week's ingredients, added up and grouped by aisle. Shared by the tool
 * that reads the list back and the one that sends it to Instacart, so both
 * are shopping from the same list.
 */
export async function shoppingListFor(
  profileId: string,
  input: { weekStart?: string; fromDayOfWeek?: number },
): Promise<ShoppingList> {
  const week = input.weekStart ?? weekStart(await todayForProfile(profileId));
  const [plan] = await db.select().from(mealPlans)
    .where(and(eq(mealPlans.profileId, profileId), eq(mealPlans.weekStart, week))).limit(1);

  const rows = plan
    ? await db.select().from(meals).where(eq(meals.mealPlanId, plan.id))
    : [];
  const wanted = input.fromDayOfWeek === undefined
    ? rows
    : rows.filter((m) => m.dayOfWeek >= input.fromDayOfWeek!);

  // Things no meal asked for — coffee, loo roll — added by hand, either for
  // this week or standing. Aggregated with the rest so they add up the same
  // way and reach Instacart with everything else.
  const extras = await db.select({ item: shoppingExtras.item })
    .from(shoppingExtras)
    .where(and(
      eq(shoppingExtras.profileId, profileId),
      or(isNull(shoppingExtras.weekStart), eq(shoppingExtras.weekStart, week)),
    ));

  const items = aggregateIngredients([
    ...wanted.flatMap((m) => m.ingredients),
    ...extras.map((e) => e.item),
  ]);

  // No plan and nothing added by hand is genuinely no list. No plan but "add
  // coffee" is a list of one, and dropping it would make the tool look broken.
  if (!plan && items.length === 0) return { exists: false, weekStart: week };

  // Aisle comes from the food library, so it is the same categorisation the
  // calculator uses rather than a second list to keep in step.
  const library = await foodLabels();

  // Rank, do not just match. Direction matters: when the shopping item
  // contains the label ("chicken breast" contains "chicken"), a longer label
  // is a more specific hit. When the label contains the item ("garlic bread"
  // contains "garlic"), a longer label is a *worse* hit — that is how garlic
  // ended up filed as a frozen ready meal.
  const aisleFor = (item: string): string => aisleForItem(item, library);

  const grouped = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const aisle = aisleFor(item.item);
    grouped.set(aisle, [...(grouped.get(aisle) ?? []), item]);
  }

  const order = ["Fruit & veg", "Meat & fish", "Dairy & eggs", "Chilled & frozen", "Cupboard", "Snacks", "Drinks", "Other"];
  return {
    exists: true,
    weekStart: week,
    mealsCovered: wanted.length,
    aisles: order.filter((a) => grouped.has(a)).map((aisle) => ({ aisle, items: grouped.get(aisle) ?? [] })),
  };
}

/**
 * Which aisle an item belongs in, ranked against the food library.
 *
 * Rank, do not just match. Direction matters: when the shopping item contains
 * the label ("chicken breast" contains "chicken") a longer label is a more
 * specific hit; when the label contains the item ("garlic bread" contains
 * "garlic") a longer label is a *worse* hit — which is how garlic came to be
 * filed as a frozen ready meal.
 */
export function aisleForItem(
  item: string,
  library: { name: string; category: string; aliases: string[] }[],
): string {
  const q = item.toLowerCase().trim();
  // Every label contains the empty string, so an empty item would match the
  // whole library and be filed under whichever label happened to be shortest.
  // aggregateIngredients drops empty items before they get here; a function
  // this small should not depend on that.
  if (q === "") return "Other";

  let best: { category: string; rank: number; length: number } | null = null;

  for (const f of library) {
    for (const label of [f.name, ...f.aliases]) {
      const l = label.toLowerCase().trim();
      let rank: number;
      if (l === q) rank = 0;
      else if (q.includes(l)) rank = 1;
      else if (l.includes(q)) rank = 2;
      else continue;

      const better =
        !best ||
        rank < best.rank ||
        // Within a rank: longest label when the item contains it, shortest
        // when it contains the item.
        (rank === best.rank && (rank === 1 ? l.length > best.length : l.length < best.length));
      if (better) best = { category: f.category, rank, length: l.length };
    }
  }
  return best ? AISLES[best.category] ?? "Other" : "Other";
}
