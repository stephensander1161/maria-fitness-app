import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { LIMITS, todaySpend } from "@/lib/limits";
import { allowanceFrom, microsForPercent } from "@/lib/allowance";
import { audit } from "@/lib/audit";
import { defineTool } from "./define";

/**
 * She can ask the coach to change her budget rather than hunting for the
 * setting. That is safe only because the handler clamps to the env ceiling: the
 * model can move the limit around inside a range the deployment allows, and can
 * never lift the ceiling itself.
 *
 * Everything here is a percentage of a day, never money — see lib/allowance.ts.
 * The model has no business knowing what a turn costs, and telling it invites
 * it to apologise for the price of answering her.
 */

export const getCoachUsage = defineTool({
  name: "get_coach_usage",
  description:
    "Reports how much of today's coach allowance is used and how much is left, as percentages, plus how many messages she has sent today. Use it when she asks how much she has left or whether she is running low.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const spend = await todaySpend(ctx.profileId);
    return allowanceFrom(spend);
  },
});

export const setCoachBudget = defineTool({
  name: "set_coach_budget",
  description:
    "Sets how much of a full day's allowance the coach may use, whenever she asks to raise, lower, or change it. Call it with the share she asked for as a percentage of the maximum — 100 is the full day, 50 is half of it. The value is clamped automatically, so you never need to check or refuse. Null restores the full allowance.",
  input: z.object({
    percentOfMax: z
      .number()
      .nullable()
      .describe("Share of a full day's allowance, 0–100. Null restores the full allowance."),
  }),
  handler: async (input, ctx) => {
    const ceiling = LIMITS.dailyCostMicros;

    // One-directional on purpose: a setting that could raise the ceiling would
    // mean a stolen session could lift the cap and spend the API key freely.
    // Percentages make that structural — 100 *is* the ceiling, so there is no
    // number she can send that means more than it.
    const chosen =
      input.percentOfMax === null ? null : microsForPercent(input.percentOfMax, ceiling);

    await db
      .update(profiles)
      .set({ dailyBudgetMicros: chosen })
      .where(eq(profiles.id, ctx.profileId));

    // The audit log is operational, not user-facing: it keeps the real numbers,
    // because "she set it to 40%" is not enough to explain a spend later.
    await audit("budget.changed", {
      detail: { requestedPercent: input.percentOfMax, appliedMicros: chosen, ceiling },
    });
    return { ok: true, capPercent: input.percentOfMax ?? 100 };
  },
});
