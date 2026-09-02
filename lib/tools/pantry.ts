import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pantryItems } from "@/lib/db/schema";
import { foodUnitsFor, todayForProfile } from "@/lib/profile";
import { quantityLabel } from "@/lib/food-units";
import {
  applyConsumption, applyRestock, compareStock, normaliseItem, summariseStock, unitIn,
} from "@/lib/pantry";
import { pantryNeeds, pantryStock } from "@/lib/views";
import { shoppingListFor } from "@/lib/shopping-list";
import { parseIngredientLine } from "@/lib/shopping";
import { defineTool } from "./define";

/**
 * Write a set of computed rows back. Amount null is a real value here — "she
 * has some, we do not know how much" — so it is written, not skipped.
 */
export async function writeStock(
  profileId: string,
  rows: { item: string; unit: string | null; amount: number | null }[],
) {
  if (rows.length === 0) return;
  await db.insert(pantryItems)
    .values(rows.map((r) => ({
      profileId,
      item: normaliseItem(r.item),
      unit: unitIn(r.unit),
      amount: r.amount,
      updatedAt: new Date(),
    })))
    .onConflictDoUpdate({
      target: [pantryItems.profileId, pantryItems.item, pantryItems.unit],
      // The computed amount wins, including when it is null: "she has some,
      // uncounted" is a value this app carries deliberately, not a gap.
      set: { amount: sql`excluded.amount`, updatedAt: new Date() },
    });
}

/**
 * Take a cooked meal out of the kitchen. Called by log_meal when she logs a
 * planned meal, so the stock follows what she actually ate rather than what
 * was planned for her.
 */
export async function consumeForMeal(profileId: string, ingredients: string[]) {
  if (ingredients.length === 0) return { touched: 0 };
  const stock = await pantryStock(profileId);
  const changes = applyConsumption(stock, ingredients);
  await writeStock(profileId, changes);
  return { touched: changes.length };
}

/**
 * One line, however it was given. "500g rice" typed into the kitchen box and
 * { item: "rice", amount: 500, unit: "g" } from the model are the same thing,
 * read by the same parser the recipes go through — one grammar, not two.
 */
function readItem(i: { item: string; amount?: number; unit?: string }) {
  const unit = i.unit?.trim().toLowerCase() || null;
  if (i.amount !== undefined) return { item: i.item, amount: i.amount, unit };

  const parsed = parseIngredientLine(i.item);
  return parsed.amount === null
    ? { item: i.item, amount: null, unit }
    : { item: parsed.item, amount: parsed.amount, unit: unit ?? parsed.unit };
}

const itemInput = z.object({
  item: z.string().describe("The food itself, e.g. 'chicken breast' — no amount in this field"),
  amount: z.number().optional()
    .describe("Leave it out when she does not know or did not say. It is recorded as 'some', never as none."),
  unit: z.string().optional()
    .describe("As a recipe writes it: g, ml, tbsp, cans. Omit for a bare count like eggs. Metric — the app shows her units."),
});

export const getPantry = defineTool({
  name: "get_pantry",
  description:
    "What is in her kitchen, and whether it covers the meals still to cook this week. Every line says which kind of number it is: an amount, 'some' when nobody has counted it, or out. Use it before suggesting a meal or telling her what to buy — and never read 'some' as enough, or a missing line as none.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const fu = await foodUnitsFor(ctx.profileId);
    const stock = await pantryStock(ctx.profileId);
    const { needs, weekStart: week, hasPlan } = await pantryNeeds(
      ctx.profileId, await todayForProfile(ctx.profileId),
    );
    const lines = compareStock(needs, stock);

    return {
      weekStart: week,
      hasMealPlan: hasPlan,
      foodUnits: fu,
      inKitchen: stock.map((s) => ({
        item: s.item,
        amount: s.amount === null
          ? "some (nobody has counted it)"
          : s.amount === 0 ? "out" : quantityLabel(s.amount, s.unit, fu),
        counted: s.amount !== null,
      })),
      forThisWeek: lines.map((l) => ({
        item: l.item,
        needed: l.amount === null ? null : quantityLabel(l.amount, l.unit, fu),
        inKitchen: l.have === null ? null : quantityLabel(l.have, l.unit, fu),
        status: l.status,
        shortBy: l.shortBy === null ? null : quantityLabel(l.shortBy, l.unit, fu),
      })),
      summary: summariseStock(lines),
      note: "status 'unknown' means the amount was never counted or is measured differently — it is not a shortage and not a surplus. Ask her rather than assuming.",
    };
  },
});

export const addToPantry = defineTool({
  name: "add_to_pantry",
  description:
    "Put groceries into her kitchen — after a shop, or when she mentions buying something. Amounts add to what is already there. An item can be written the way a recipe writes it ('500g rice', '2 tins tomatoes') and it is read apart here. Leave the amount out when she did not say one; it is recorded as 'some', which is honest, rather than as a number nobody counted.",
  input: z.object({
    items: z.array(itemInput).min(1),
  }),
  handler: async (input, ctx) => {
    const stock = await pantryStock(ctx.profileId);
    const rows = applyRestock(stock, input.items.map(readItem));
    await writeStock(ctx.profileId, rows);
    const fu = await foodUnitsFor(ctx.profileId);
    return {
      ok: true,
      added: rows.map((r) => ({
        item: r.item,
        nowHolding: r.amount === null ? "some (uncounted)" : quantityLabel(r.amount, r.unit, fu),
      })),
    };
  },
});

export const setPantryItem = defineTool({
  name: "set_pantry_item",
  description:
    "Correct what the kitchen holds — she counted it, or she has just run out. Replaces the amount rather than adding to it. Pass amount 0 for 'we're out of this', which is a fact worth keeping; leave amount out for 'there's some, I haven't counted it'.",
  input: itemInput,
  handler: async (input, ctx) => {
    const unit = input.unit?.trim().toLowerCase() || null;
    await writeStock(ctx.profileId, [{
      item: input.item, unit, amount: input.amount ?? null,
    }]);
    const fu = await foodUnitsFor(ctx.profileId);
    return {
      ok: true,
      item: normaliseItem(input.item),
      nowHolding: input.amount === undefined
        ? "some (uncounted)"
        : input.amount === 0 ? "out" : quantityLabel(input.amount, unit, fu),
    };
  },
});

export const removePantryItem = defineTool({
  name: "remove_pantry_item",
  description:
    "Take something out of the kitchen list entirely — she threw it out, or it was never really there. To say she has run out but still buys it, use set_pantry_item with amount 0 instead, so the shopping list knows to put it back.",
  input: z.object({
    item: z.string(),
    unit: z.string().optional().describe("Only when she keeps the same food in two measures"),
  }),
  handler: async (input, ctx) => {
    const item = normaliseItem(input.item);
    const rows = await db.select({ id: pantryItems.id, unit: pantryItems.unit })
      .from(pantryItems)
      .where(and(eq(pantryItems.profileId, ctx.profileId), eq(pantryItems.item, item)));

    const wanted = input.unit === undefined
      ? rows
      : rows.filter((r) => r.unit === unitIn(input.unit));
    if (wanted.length === 0) return { ok: false, error: `Nothing called "${item}" in her kitchen.` };

    await db.delete(pantryItems).where(and(
      eq(pantryItems.profileId, ctx.profileId),
      inArray(pantryItems.id, wanted.map((r) => r.id)),
    ));
    return { ok: true, removed: item, lines: wanted.length };
  },
});

export const markShoppingBought = defineTool({
  name: "mark_shopping_bought",
  description:
    "Puts the week's shopping list into her kitchen after a shop, at the quantities the list asked for. Use it when she says she has been shopping or that the delivery arrived. Pass `items` to record only part of the list — the rest stays on it. This is the honest version of restocking: the amounts come from the plan she shopped from, not from a guess.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
    fromDayOfWeek: z.number().optional(),
    items: z.array(z.string()).optional()
      .describe("Only these items, named as get_shopping_list returned them. Omit for the whole list."),
  }),
  handler: async (input, ctx) => {
    const list = await shoppingListFor(ctx.profileId, input);
    if (!list.exists) return { ok: false, error: "No meal plan for that week — nothing to have bought." };

    const all = list.aisles.flatMap((a) => a.items);
    const wanted = input.items ? new Set(input.items.map(normaliseItem)) : null;
    const bought = (wanted ? all.filter((i) => wanted.has(normaliseItem(i.item))) : all)
      .map((i) => ({ item: i.item, amount: i.amount, unit: i.unit }));

    if (bought.length === 0) {
      return { ok: false, error: wanted ? "None of those are on this week's list." : "The list is empty." };
    }

    const rows = applyRestock(await pantryStock(ctx.profileId), bought);
    await writeStock(ctx.profileId, rows);
    const fu = await foodUnitsFor(ctx.profileId);

    return {
      ok: true,
      added: rows.length,
      // An item the list could not quantify goes in as "some". Saying so is the
      // point: she should not later be told she has 0 of it.
      uncounted: rows.filter((r) => r.amount === null).map((r) => r.item),
      nowHolding: rows.map((r) => ({
        item: r.item,
        amount: r.amount === null ? "some (uncounted)" : quantityLabel(r.amount, r.unit, fu),
      })),
    };
  },
});
