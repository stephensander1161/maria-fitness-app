import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import { todayForProfile } from "@/lib/profile";
import { todayView } from "@/lib/views";
import { areasFor, coolDownFor, REST_DAY_FLOW, warmUpFor, MAX_STRETCHES } from "@/lib/stretches";
import { defineTool } from "./define";

/**
 * What to do before and after, asked for out loud.
 *
 * No new content and no new table: forty-two mobility movements were already
 * in the library with cues, mistakes and safety notes. This only decides which
 * of them to put in front of her, and the coach can already reach the rest
 * through search_exercises and get_exercise_guide.
 */

async function named(slugs: string[]) {
  if (slugs.length === 0) return [];
  const rows = await db.select({ slug: exercises.slug, name: exercises.name })
    .from(exercises).where(inArray(exercises.slug, slugs));
  const by = new Map(rows.map((r) => [r.slug, r.name]));
  // Ordered as chosen, not as the database returned them.
  return slugs.flatMap((s) => (by.has(s) ? [{ slug: s, name: by.get(s)! }] : []));
}

export const getStretches = defineTool({
  name: "get_stretches",
  description:
    "Suggests what to loosen up before a session and what to stretch after it, chosen from the movements that day actually trains — a squat day gets ankles and hips, a pressing day gets the upper back and chest. Use it when she asks about warming up, cooling down, stretching, or feeling tight. Before a session these are movements, never long holds: holding a stretch right before lifting measurably lowers what she can lift.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
    when: z.enum(["before", "after", "both"]).optional()
      .describe("Warm-up, cool-down, or both. Default both."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;
    const view = await todayView(ctx.profileId, "metric", date);
    // Only the muscles are read, so the unit passed here never reaches her.
    const muscles = view.exercises.flatMap((e) => e.muscles);

    if (muscles.length === 0) {
      return {
        ok: true,
        date,
        restDay: true,
        // A rest day is not a day with nothing to offer — the screen already
        // said "a walk or some mobility work is plenty" and then offered none.
        flow: await named(REST_DAY_FLOW),
        note: "Nothing is planned for this day, so this is a general loosen-off rather than a warm-up for anything. Hold each for about 30 seconds.",
      };
    }

    const when = input.when ?? "both";
    return {
      ok: true,
      date,
      trains: areasFor(muscles),
      warmUp: when === "after" ? undefined : await named(warmUpFor(muscles, MAX_STRETCHES)),
      coolDown: when === "before" ? undefined : await named(coolDownFor(muscles, MAX_STRETCHES)),
      note: "Before a session these are movements, a few reps each, never held. After it, hold each for about 30 seconds. Both are logged like any other movement if she wants them counted.",
    };
  },
});
