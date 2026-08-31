import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { LIMITS, todaySpend } from "@/lib/limits";
import { defineTool } from "./define";

/**
 * She can ask the coach to change her budget rather than hunting for the
 * setting. That is safe only because the handler clamps to the env ceiling: the
 * model can move the limit around inside a range the deployment allows, and can
 * never lift the ceiling itself.
 */

export const getCoachUsage = defineTool({
  name: "get_coach_usage",
  description: "Today's coach spend, her chosen daily budget, and the configured ceiling.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const spend = await todaySpend(ctx.profileId);
    const [row] = await db
      .select({ chosen: profiles.dailyBudgetMicros })
      .from(profiles)
      .where(eq(profiles.id, ctx.profileId))
      .limit(1);

    return {
      spentMicros: spend.costMicros,
      limitMicros: spend.limitMicros,
      ceilingMicros: spend.ceilingMicros,
      chosenMicros: row?.chosen ?? null,
      requests: spend.requests,
    };
  },
});

export const setCoachBudget = defineTool({
  name: "set_coach_budget",
  description:
    "Set how much the coach may spend per day, whenever she asks to raise, lower, or change it. Just call it with the amount she asked for — the value is clamped to the deployment ceiling automatically, so you never need to check or refuse. Amounts are in millionths of a dollar: 25 cents is 250000. Null restores the default.",
  input: z.object({
    budgetMicros: z
      .number()
      .nullable()
      .describe("Millionths of a dollar per day. Null restores the configured ceiling."),
  }),
  handler: async (input, ctx) => {
    const ceiling = LIMITS.dailyCostMicros;

    // One-directional on purpose: a setting that could raise the ceiling would
    // mean a stolen session could lift the cap and spend the API key freely.
    const chosen =
      input.budgetMicros === null
        ? null
        : Math.min(Math.max(Math.round(input.budgetMicros), 0), ceiling);

    await db
      .update(profiles)
      .set({ dailyBudgetMicros: chosen })
      .where(eq(profiles.id, ctx.profileId));

    return { ok: true, limitMicros: chosen ?? ceiling, ceilingMicros: ceiling };
  },
});
