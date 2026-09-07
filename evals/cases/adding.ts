import { weekStart } from "@/lib/date";
import type { EvalCase } from "../harness";
import { onboardedProfile, planDaySlugs, seedPlanWeek } from "../seed";

/**
 * Regression tests for: adding something should be one step. "Please add my
 * physio exercises every second day" produced a meal plan and five food
 * lookups fired together, killed at the function's wall; and food described
 * in words was being asked about instead of logged.
 */
const PLANNERS = ["create_weekly_plan", "create_meal_plan", "run_plan_setup"];

export const addingFood: EvalCase = {
  name: "adding-food",
  bug: "asked about food she described instead of logging it, or rebuilt a plan to do so",
  profile: onboardedProfile(),
  run: async (ctx) => {
    const turn = await ctx.say("I had two scrambled eggs and a slice of buttered toast for breakfast.");
    ctx.hard("logged the meal in the same turn", turn.tools.includes("log_meal"), `tools: ${turn.tools.join(", ") || "none"}`);
    ctx.hard("did not touch a planner", !turn.tools.some((t) => PLANNERS.includes(t)), `tools: ${turn.tools.join(", ")}`);
    ctx.hard("looked food up a sane number of times", turn.tools.filter((t) => t === "lookup_food").length <= 3, `lookups: ${turn.tools.filter((t) => t === "lookup_food").length}`);
    await ctx.soft("confirmed it was logged without asking for more detail", {
      reply: turn.text,
      context: "She described her breakfast. The assistant has tools to look food up and log it, and did.",
      criterion: "Does the reply confirm the meal was logged (with a rough number, an estimate is fine) and NOT ask her a question she must answer before it can be logged?",
    });
  },
};

export const addingExercise: EvalCase = {
  name: "adding-exercise",
  bug: "rebuilt the week (or the meals) when asked to add an exercise to some days",
  profile: onboardedProfile(),
  seed: async (profileId) => {
    await seedPlanWeek(profileId, {
      title: "Full body, three days",
      days: [
        { dayOfWeek: 0, title: "Full body A", exercises: [{ slug: "goblet-squat", sets: 3, reps: 10 }, { slug: "dumbbell-row", sets: 3, reps: 10 }] },
        { dayOfWeek: 1, title: "Rest", isRest: true },
        { dayOfWeek: 2, title: "Full body B", exercises: [{ slug: "dumbbell-bench-press", sets: 3, reps: 10 }] },
        { dayOfWeek: 3, title: "Rest", isRest: true },
        { dayOfWeek: 4, title: "Full body C", exercises: [{ slug: "goblet-squat", sets: 3, reps: 10 }] },
        { dayOfWeek: 5, title: "Rest", isRest: true },
        { dayOfWeek: 6, title: "Rest", isRest: true },
      ],
    });
  },
  run: async (ctx) => {
    const turn = await ctx.say("Please add glute bridges to Monday, Wednesday and Friday, 3 sets of 12.");
    const adds = turn.tools.filter((t) => t === "add_exercise_to_day" || t === "adjust_plan_day").length;
    ctx.hard("added through the per-day tools", adds >= 1, `tools: ${turn.tools.join(", ") || "none"}`);
    ctx.hard("did not rebuild the week or the meals", !turn.tools.some((t) => PLANNERS.includes(t)), `tools: ${turn.tools.join(", ")}`);
    const profileId = (await ctx.profile()).id;
    const changed = await Promise.all([0, 2, 4].map(async (d) => ((await planDaySlugs(profileId, d, weekStart())) ?? []).some((s) => /glute-bridge/.test(s))));
    ctx.hard("the three days actually carry the movement", changed.every(Boolean), `mon/wed/fri: ${changed.join("/")}`);
  },
};
