import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { defineTool } from "./define";
import { todayForProfile } from "@/lib/profile";
import { weekStart } from "@/lib/date";
import { burnByDay, burnThisWeek } from "@/lib/progress";
import { BURN_CAVEAT } from "@/lib/burn";

/**
 * What her training has probably cost her, as something she can ask about.
 *
 * The number is an estimate from population averages and every surface says
 * so. It is deliberately not wired into any calorie target: the app's real
 * expenditure figure is measured from intake against her weight trend, and
 * that measurement already contains her training. Adding this on top would
 * count the same session twice. See lib/burn.ts.
 */
export const getCaloriesBurned = defineTool({
  name: "get_calories_burned",
  description:
    "Estimates what her training has cost in calories — this week by default, or any date range. Use it when she asks how much a session burned or how much she has worked off. Always present it as an estimate, and never add it to what she can eat: the app works her intake out from her weight trend, which already includes her training, so adding this would count it twice.",
  input: z.object({
    from: z.string().optional().describe("YYYY-MM-DD; defaults to this week's Monday"),
    to: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
  }),
  handler: async (input, ctx) => {
    const [p] = await db.select({ startWeightKg: profiles.startWeightKg })
      .from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    const today = await todayForProfile(ctx.profileId);
    const fallback = p?.startWeightKg ?? 70;

    if (input.from || input.to) {
      const days = await burnByDay(ctx.profileId, input.from ?? weekStart(today), input.to ?? today, fallback);
      const total = days.reduce((n, d) => n + d.kcal, 0);
      return {
        from: input.from ?? weekStart(today), to: input.to ?? today,
        totalKcal: total, sessions: days.length, days, estimate: BURN_CAVEAT,
      };
    }

    const week = await burnThisWeek(ctx.profileId, weekStart(today), fallback);
    return {
      weekStart: weekStart(today),
      totalKcal: week.total,
      sessions: week.sessions,
      // Null rather than zero when she has not trained: an average over no
      // sessions is not a number, and zero would read as a bad week.
      perSessionKcal: week.perSession,
      days: week.days,
      estimate: BURN_CAVEAT,
    };
  },
});
