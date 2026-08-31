import { inToCm, weightIn } from "@/lib/units";
import type { EvalCase } from "../harness";
import { blankProfile } from "../seed";

/**
 * Regression test for: the coach interviewed her through a whole onboarding,
 * held every answer in the conversation, and never once called update_profile.
 * The transcript looked perfect and the database was empty — so the next
 * session started from nothing and the plan it built was guesswork.
 *
 * The assertion that matters is not "it said it saved" but "the row changed",
 * which is why every check here is hard.
 */
export const onboarding: EvalCase = {
  name: "onboarding",
  bug: "gathered her whole profile and never called update_profile — nothing persisted",
  profile: blankProfile(),

  run: async (ctx) => {
    const first = await ctx.say(
      "Hi — I'm Nadia. I want to get strong again; I've felt weak since my second kid and I'm sick of it.",
    );
    ctx.hard(
      "turn 1 called update_profile",
      first.tools.includes("update_profile"),
      `tools: ${first.tools.join(", ") || "none"}`,
    );

    const afterFirst = await ctx.profile();
    ctx.hard(
      "her name reached the database",
      afterFirst.name?.toLowerCase().includes("nadia") ?? false,
      `profiles.name = ${JSON.stringify(afterFirst.name)}`,
    );

    const second = await ctx.say("I'm 34, five foot six, and about 168 pounds right now.");
    ctx.hard(
      "turn 2 called update_profile in the same turn the facts were stated",
      second.tools.includes("update_profile"),
      `tools: ${second.tools.join(", ") || "none"}`,
    );

    const p = await ctx.profile();
    const expectedBirthYear = new Date().getFullYear() - 34;
    ctx.hard(
      "age persisted",
      p.birthYear === expectedBirthYear,
      `birth_year = ${p.birthYear} (expected ${expectedBirthYear})`,
    );

    const expectedCm = inToCm(66);
    ctx.hard(
      "height persisted in centimetres",
      p.heightCm !== null && Math.abs(p.heightCm - expectedCm) <= 2,
      `height_cm = ${round(p.heightCm)} (expected ~${round(expectedCm)} for 5'6")`,
    );

    const expectedKg = weightIn(168, "imperial");
    ctx.hard(
      "weight persisted in kilograms",
      p.startWeightKg !== null && Math.abs(p.startWeightKg - expectedKg) <= 1,
      `start_weight_kg = ${round(p.startWeightKg)} (expected ~${round(expectedKg)} for 168 lb)`,
    );
  },
};

const round = (n: number | null) => (n === null ? "null" : Math.round(n * 10) / 10);
