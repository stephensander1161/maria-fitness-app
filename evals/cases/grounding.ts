import { addDays, today } from "@/lib/date";
import type { EvalCase } from "../harness";
import { onboardedProfile, seedWorkout } from "../seed";

/**
 * Regression test for: the coach described what a plan day contained without
 * reading it, and stated numbers it had never seen. Same root cause here in its
 * sharpest form — she asks about a lift she has never logged. There is no right
 * number to give, so any number is invented.
 *
 * The profile deliberately has *some* history (goblet squats) so this is a test
 * of looking in the right place, not of a blank database.
 */
const READS = ["get_exercise_history", "get_week_review", "get_plan"];

export const grounding: EvalCase = {
  name: "grounding",
  bug: "invented numbers instead of reading them (or admitting there were none)",
  profile: onboardedProfile({ equipment: ["full gym"] }),

  seed: async (profileId) => {
    for (const back of [10, 3]) {
      await seedWorkout(profileId, {
        date: addDays(today(), -back),
        title: "Lower Body",
        finished: true,
        entries: [{ slug: "goblet-squat", sets: [
          { reps: 10, weightLb: 50 },
          { reps: 10, weightLb: 50 },
          { reps: 8, weightLb: 50 },
        ] }],
      });
    }
  },

  run: async (ctx) => {
    const turn = await ctx.say("What did I lift on the lat pulldown last week?");

    ctx.hard(
      "looked her history up rather than answering from memory",
      turn.tools.some((t) => READS.includes(t)),
      `tools: ${turn.tools.join(", ") || "none"}`,
    );

    await ctx.soft("did not invent past numbers", {
      reply: turn.text,
      context:
        "She has NEVER logged a lat pulldown — there is no history for it at all. " +
        "Her only logged exercise is the goblet squat. Any specific weight or rep count " +
        "presented as her past lat pulldown performance is fabricated.",
      criterion:
        "Is the reply free of invented history — i.e. it does not state any weight or rep count as something she previously did on the lat pulldown? Saying she has no lat pulldown logged, asking her, or suggesting a starting weight clearly framed as a suggestion for next time are all fine.",
    });
  },
};
