import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { mealPlans, meals, preppedPortions } from "@/lib/db/schema";
import { addDays, daysBetween } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { consumeForMeal } from "./pantry";
import { logMeal } from "./nutrition";
import { defineTool } from "./define";

/**
 * Cooking once and eating four times.
 *
 * Meal plans fail for a boring reason — seven cooking evenings in a week
 * nobody has seven evenings in — and the fix people actually use is batch
 * cooking. Without an object for "there are four portions of chilli in the
 * fridge", the app cannot see any of it: it keeps asking her to cook, keeps
 * putting those ingredients back on the shopping list, and the portions she
 * eats get logged as words with no figures.
 */

/** Fridge life, when she does not say. Deliberately conservative. */
const KEEPS_DAYS = 4;

export const logCookSession = defineTool({
  name: "log_cook_session",
  description:
    "Records that she has batch cooked something and how many portions it made. Use it whenever she says she has made a big one, prepped for the week, or doubled a recipe. Pass mealId when it came from her plan and the ingredients come out of her kitchen for every portion made, not just one. After this she can log a portion in one step, with exact figures rather than a description.",
  input: z.object({
    title: z.string().describe("What she made, in her words"),
    portions: z.number().min(1).max(30),
    caloriesPerPortion: z.number().optional(),
    proteinPerPortion: z.number().optional(),
    mealId: z.string().optional().describe("From get_meal_plan, when she cooked something planned"),
    keepsDays: z.number().optional().describe("How long it will keep. Default 4 days in the fridge."),
    cookedOn: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const cookedOn = input.cookedOn ?? today;

    let calories = input.caloriesPerPortion ?? null;
    let protein = input.proteinPerPortion ?? null;
    let pantryLines = 0;

    if (input.mealId) {
      const [planned] = await db.select()
        .from(meals)
        .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
        .where(and(eq(meals.id, input.mealId), eq(mealPlans.profileId, ctx.profileId)))
        .limit(1);
      if (!planned) return { ok: false, error: "Meal not found — call get_meal_plan for current ids." };

      calories = calories ?? planned.meals.calories;
      protein = protein ?? planned.meals.proteinG;

      // The kitchen loses the ingredients for every portion she made, not one.
      // A meal in the plan is one portion, so cooking four is four times the
      // shopping — which is the whole reason the list was wrong before.
      const scaled = Array.from({ length: input.portions })
        .flatMap(() => planned.meals.ingredients);
      pantryLines = (await consumeForMeal(ctx.profileId, scaled)).touched;
    }

    const [row] = await db.insert(preppedPortions).values({
      profileId: ctx.profileId,
      title: input.title.trim(),
      portionsTotal: input.portions,
      portionsLeft: input.portions,
      caloriesPerPortion: calories,
      proteinPerPortion: protein,
      cookedOn,
      keepsUntil: addDays(cookedOn, input.keepsDays ?? KEEPS_DAYS),
      mealId: input.mealId ?? null,
    }).returning();

    return {
      ok: true,
      id: row.id,
      title: row.title,
      portions: row.portionsLeft,
      keepsUntil: row.keepsUntil,
      pantryLinesUpdated: pantryLines,
      hint: "Log a portion with eat_prepped_portion — one step, and the figures are exact.",
    };
  },
});

export const listPreppedPortions = defineTool({
  name: "list_prepped_portions",
  description:
    "What she has already cooked and how many portions are left, with how long each keeps. Check it before suggesting she cook anything, and before answering 'what's for dinner?' — the answer is usually in the fridge. Anything past its date is flagged rather than quietly offered.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const rows = await db.select().from(preppedPortions)
      .where(and(eq(preppedPortions.profileId, ctx.profileId), gt(preppedPortions.portionsLeft, 0)))
      .orderBy(asc(preppedPortions.keepsUntil));

    return {
      portions: rows.map((r) => ({
        id: r.id,
        title: r.title,
        portionsLeft: r.portionsLeft,
        of: r.portionsTotal,
        caloriesPerPortion: r.caloriesPerPortion,
        proteinPerPortion: r.proteinPerPortion,
        cookedOn: r.cookedOn,
        keepsUntil: r.keepsUntil,
        // Said plainly rather than left for her to work out at the fridge door.
        pastItsDate: r.keepsUntil !== null && r.keepsUntil < today,
        daysLeft: r.keepsUntil === null ? null : daysBetween(today, r.keepsUntil),
      })),
      hint: rows.length === 0
        ? "Nothing cooked in advance. If she is short on time this week, batch cooking one dinner is the single change that keeps a meal plan alive."
        : undefined,
    };
  },
});

export const eatPreppedPortion = defineTool({
  name: "eat_prepped_portion",
  description:
    "Logs a portion of something she batch cooked and takes it off the count, in one step. Prefer it over log_meal whenever what she ate came out of the fridge: the figures are exact rather than estimated, which is the difference between a day that can be counted and one that cannot.",
  input: z.object({
    id: z.string().optional().describe("From list_prepped_portions"),
    title: z.string().optional().describe("Or name it — 'the chilli'"),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    portions: z.number().optional().describe("If she had two"),
    date: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    if (!input.id && !input.title) return { ok: false, error: "Say which one — an id or a name." };

    const rows = await db.select().from(preppedPortions)
      .where(and(eq(preppedPortions.profileId, ctx.profileId), gt(preppedPortions.portionsLeft, 0)))
      .orderBy(asc(preppedPortions.keepsUntil));

    const wanted = input.id
      ? rows.find((r) => r.id === input.id)
      : rows.find((r) => r.title.toLowerCase().includes(input.title!.trim().toLowerCase()));
    if (!wanted) return { ok: false, error: "Nothing in the fridge matching that — call list_prepped_portions." };

    const eaten = Math.min(input.portions ?? 1, wanted.portionsLeft);
    const [updated] = await db.update(preppedPortions)
      .set({ portionsLeft: wanted.portionsLeft - eaten })
      .where(eq(preppedPortions.id, wanted.id))
      .returning();

    // Through the normal write path, so the day's totals, the fibre floor and
    // the kitchen all behave exactly as they would for anything else.
    const logged = await logMeal.handler({
      slot: input.slot,
      description: eaten > 1 ? `${eaten} portions of ${wanted.title}` : wanted.title,
      ...(wanted.caloriesPerPortion === null ? {} : { calories: wanted.caloriesPerPortion * eaten }),
      ...(wanted.proteinPerPortion === null ? {} : { proteinG: wanted.proteinPerPortion * eaten }),
      ...(input.date ? { date: input.date } : {}),
    }, ctx) as Record<string, unknown>;

    return {
      ok: true,
      ate: wanted.title,
      portions: eaten,
      portionsLeft: updated.portionsLeft,
      finished: updated.portionsLeft === 0,
      ...logged,
    };
  },
});

export const adjustPreppedPortion = defineTool({
  name: "adjust_prepped_portion",
  description:
    "Corrects how many portions are left, or throws the rest out. Use it when she says it went further than she thought, or that the last of it went in the bin — a count nobody can correct is one she stops trusting.",
  input: z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    portionsLeft: z.number().min(0).optional().describe("The new count. 0 clears it."),
    discard: z.boolean().optional().describe("True to remove it entirely"),
  }),
  handler: async (input, ctx) => {
    const rows = await db.select().from(preppedPortions)
      .where(eq(preppedPortions.profileId, ctx.profileId));
    const wanted = input.id
      ? rows.find((r) => r.id === input.id)
      : input.title
        ? rows.find((r) => r.title.toLowerCase().includes(input.title!.trim().toLowerCase()))
        : undefined;
    if (!wanted) return { ok: false, error: "Nothing matching that — call list_prepped_portions." };

    if (input.discard) {
      await db.delete(preppedPortions).where(eq(preppedPortions.id, wanted.id));
      return { ok: true, removed: wanted.title };
    }
    if (input.portionsLeft === undefined) {
      return { ok: false, error: "Say the new count, or pass discard: true." };
    }

    const [updated] = await db.update(preppedPortions)
      .set({ portionsLeft: Math.min(input.portionsLeft, wanted.portionsTotal) })
      .where(eq(preppedPortions.id, wanted.id)).returning();
    return { ok: true, title: updated.title, portionsLeft: updated.portionsLeft };
  },
});

/** For the kitchen card, and for the coach's state block. */
export async function preppedSummary(profileId: string, asOf: string): Promise<string | null> {
  const rows = await db.select().from(preppedPortions)
    .where(and(eq(preppedPortions.profileId, profileId), gt(preppedPortions.portionsLeft, 0)))
    .orderBy(asc(preppedPortions.keepsUntil));
  if (rows.length === 0) return null;

  const parts = rows.map((r) => {
    const past = r.keepsUntil !== null && r.keepsUntil < asOf;
    return `${r.portionsLeft} × ${r.title}${past ? " (past its date)" : ""}`;
  });
  return `Already cooked and in the fridge: ${parts.join(", ")}. Suggest these before suggesting she cooks.`;
}
