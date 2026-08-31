import { addDays, today } from "@/lib/date";
import type { EvalCase } from "../harness";
import { onboardedProfile, seedWorkout } from "../seed";

/**
 * Regression test for: she tapped every set into the Train screen, told the
 * coach she was done, and it asked her to type all of it out again. The data
 * was sitting in the database the whole time.
 *
 * Today's sets are seeded and the session is left open, exactly as the fast-log
 * screen leaves it.
 */
const READS = ["get_week_review", "get_exercise_history", "get_plan", "finish_workout"];

export const alreadyLogged: EvalCase = {
  name: "already-logged",
  bug: "asked her to retype sets she had already logged instead of reading them",
  profile: onboardedProfile(),

  seed: async (profileId) => {
    await seedWorkout(profileId, {
      date: addDays(today(), -7),
      title: "Upper Body",
      finished: true,
      entries: [
        { slug: "dumbbell-bench-press", sets: [
          { reps: 8, weightLb: 20 },
          { reps: 8, weightLb: 20 },
          { reps: 7, weightLb: 20 },
        ] },
        { slug: "dumbbell-row", sets: [
          { reps: 10, weightLb: 25 },
          { reps: 10, weightLb: 25 },
          { reps: 10, weightLb: 25 },
        ] },
      ],
    });
    await seedWorkout(profileId, {
      date: today(),
      title: "Upper Body",
      entries: [
        { slug: "dumbbell-bench-press", sets: [
          { reps: 10, weightLb: 25 },
          { reps: 10, weightLb: 25 },
          { reps: 9, weightLb: 25 },
        ] },
        { slug: "dumbbell-row", sets: [
          { reps: 12, weightLb: 30 },
          { reps: 12, weightLb: 30 },
          { reps: 11, weightLb: 30 },
        ] },
      ],
    });
  },

  run: async (ctx) => {
    const turn = await ctx.say("I just finished, how did I do?");

    ctx.hard(
      "read the session she already logged",
      turn.tools.some((t) => READS.includes(t)),
      `tools: ${turn.tools.join(", ") || "none"}`,
    );

    await ctx.soft("did not ask her to retype what she logged", {
      reply: turn.text,
      context:
        "She has already logged today's whole session: dumbbell bench press 3 sets of ~10 at 25 lb, " +
        "single-arm dumbbell row 3 sets of ~12 at 30 lb. All of it is in the database and available " +
        "to the assistant's tools. Last week the same session was 20 lb and 25 lb respectively, so today was up.",
      criterion:
        "Is the reply free of any request for her to supply the session's numbers — i.e. it does not ask what she lifted, what weight she used, how many sets or reps she did, or ask her to list the session? Asking how it felt, about RPE, or about anything not already recorded is fine.",
    });
  },
};
