import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { LIMITS, todaySpend } from "@/lib/limits";
import { defineTool } from "./define";

/**
 * Both tools are UI-only. The budget is a setting, not something a coaching
 * conversation should reach for — and a model that could raise its own spending
 * limit is precisely the thing the limit exists to prevent.
 */

export const getCoachUsage = defineTool({
  name: "get_coach_usage",
  uiOnly: true,
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
  uiOnly: true,
  description:
    "Set her daily coach budget. Clamped to the configured ceiling — this can tighten the limit but never raise it past what the deployment allows.",
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
