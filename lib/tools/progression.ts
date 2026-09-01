import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { exerciseProgression } from "@/lib/progress";
import { defineTool } from "./define";

export const getProgression = defineTool({
  name: "get_exercise_progression",
  description:
    "How each movement has gone over the last twelve weeks — session by session, with the direction of travel and how long since she last did it. Sorted so anything slipping or abandoned comes first. Use this for 'how am I doing', for weekly reviews, and before changing her programme: it answers whether the plan is working, where get_exercise_history answers what she did.",
  input: z.object({
    slug: z.string().optional().describe("Limit to one movement; omit for all"),
    sinceDays: z.number().optional().describe("Window in days, default 84"),
  }),
  handler: async (input, ctx) => {
    const [p] = await db.select({ units: profiles.units }).from(profiles)
      .where(eq(profiles.id, ctx.profileId)).limit(1);

    const all = await exerciseProgression(ctx.profileId, p?.units ?? "imperial", {
      sinceDays: input.sinceDays,
    });
    const rows = input.slug ? all.filter((e) => e.slug === input.slug) : all;

    return {
      // Pre-summarised so the interesting cases don't have to be inferred.
      needsAttention: rows.filter((r) => r.trend === "slipping" || r.trend === "stalled")
        .map((r) => r.headline),
      goingWell: rows.filter((r) => r.trend === "climbing").map((r) => r.headline),
      movements: rows.map((r) => ({
        movement: r.name,
        slug: r.slug,
        trend: r.trend,
        changePct: r.changePct === null ? null : Math.round(r.changePct),
        daysSinceLast: r.daysSince,
        sessions: r.sessions.length,
        summary: r.headline,
        history: r.sessions.map((s) => ({
          date: s.date, sets: s.sets, totalReps: s.reps, topSet: s.topSet, volume: s.volume,
        })),
      })),
    };
  },
});
