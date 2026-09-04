import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles, weighIns } from "@/lib/db/schema";
import { nutritionTargets } from "@/lib/nutrition";
import { cmToIn } from "@/lib/units";
import { weekStart } from "@/lib/date";
import { todayForProfile, ageFrom } from "@/lib/profile";
import { desc } from "drizzle-orm";
import { createWeeklyPlan } from "./training";
import { defineTool } from "./define";

/**
 * The guided setup: a handful of questions, then a real week and real meals.
 *
 * Onboarding asks who she is. This asks what she wants to *do* — how many days
 * she can train, what she wants to work, what is in the kitchen — and rebuilds
 * the plan around the answers. It is deliberately re-runnable: what she can
 * commit to in January is not what she can commit to in June, and the honest
 * response to "I've only got three days now" is to rebuild the week, not to
 * leave her failing a plan written for a different life.
 *
 * The targets it computes are returned rather than acted on, so the caller can
 * plan the meals in a second request. Two planner calls in one HTTP request
 * runs past the 60-second function limit, and the failure mode is her sitting
 * on a spinner and ending up with half a plan.
 */

const FOCUS = [
  "full body", "legs and glutes", "upper body", "core", "arms", "back",
  "chest", "shoulders", "conditioning", "mobility",
] as const;

export const runPlanSetup = defineTool({
  name: "run_plan_setup",
  description:
    "Sets her training up from scratch and builds this week around it — how many days she trains, how long a session runs, what she wants to work, what equipment she has, what to work around. Saves the answers to her profile, writes the week, and returns the calorie and protein targets to plan meals with (call create_meal_plan with them next). Use it when she asks to start over, change how often she trains, or work different muscles. Everything is optional: what she does not mention keeps its current value.",
  input: z.object({
    daysPerWeek: z.number().min(1).max(7).optional(),
    sessionMinutes: z.number().min(10).max(180).optional(),
    focus: z.array(z.string()).optional()
      .describe(`What she wants to work, e.g. ${FOCUS.slice(0, 4).join(", ")}`),
    equipment: z.array(z.string()).optional(),
    injuries: z.array(z.string()).optional()
      .describe("Anything to train around. Respected by choosing other movements, never by pushing through."),
    dietaryRestrictions: z.array(z.string()).optional(),
    dislikedFoods: z.array(z.string()).optional(),
    cookingSkill: z.enum(["minimal", "comfortable", "keen"]).optional(),
    notes: z.string().max(400).optional().describe("Anything else the planner should know"),
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    const changes = {
      daysPerWeek: input.daysPerWeek ?? profile.daysPerWeek,
      sessionMinutes: input.sessionMinutes ?? profile.sessionMinutes,
      equipment: input.equipment ?? profile.equipment,
      injuries: input.injuries ?? profile.injuries,
      dietaryRestrictions: input.dietaryRestrictions ?? profile.dietaryRestrictions,
      dislikedFoods: input.dislikedFoods ?? profile.dislikedFoods,
      cookingSkill: input.cookingSkill ?? profile.cookingSkill,
    };
    await db.update(profiles).set({ ...changes, planSetupAt: new Date() })
      .where(eq(profiles.id, ctx.profileId));

    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));

    // Her weight now, not the one she signed up at — the targets are for the
    // person doing this week.
    const [latest] = await db.select({ weightKg: weighIns.weightKg })
      .from(weighIns).where(eq(weighIns.profileId, ctx.profileId))
      .orderBy(desc(weighIns.date)).limit(1);
    const weightKg = latest?.weightKg ?? profile.startWeightKg;

    const built = await createWeeklyPlan.handler(
      {
        focus: input.focus?.length ? input.focus.join(", ") : undefined,
        notes: input.notes,
        weekStart: week,
      },
      ctx,
    ) as { ok?: boolean; error?: string };

    // Targets need her body, and a profile part-way through onboarding may not
    // have one yet. Say so rather than returning numbers built on defaults.
    const age = ageFrom(profile.birthYear, await todayForProfile(ctx.profileId));
    const targets =
      weightKg !== null && profile.heightCm !== null && age !== null && changes.daysPerWeek !== null
        ? nutritionTargets({
            weightKg,
            heightIn: profile.units === "imperial" ? cmToIn(profile.heightCm) : profile.heightCm,
            age,
            sex: profile.sex ?? "female",
            daysPerWeek: changes.daysPerWeek,
            units: profile.units,
            goalWeightKg: profile.goalWeightKg,
          })
        : null;

    return {
      ok: built?.ok !== false,
      weekStart: week,
      planError: built?.ok === false ? built.error : undefined,
      savedToProfile: {
        daysPerWeek: changes.daysPerWeek,
        sessionMinutes: changes.sessionMinutes,
        equipment: changes.equipment,
        injuries: changes.injuries,
      },
      calorieTarget: targets?.calorieTarget ?? null,
      proteinTargetG: targets?.proteinTargetG ?? null,
      maintenanceCalories: targets?.maintenanceCalories ?? null,
      hint: targets
        ? "Now call create_meal_plan with calorieTarget and proteinTargetG to finish the week."
        : "Her height, age or weight is missing, so no targets could be computed — ask her for them, then call create_meal_plan.",
    };
  },
});

export const skipPlanSetup = defineTool({
  name: "skip_plan_setup",
  description:
    "Stops the app inviting her to run the guided setup. Use it when she says not now, later, or that she is happy with her plan as it is. Nothing is deleted and the setup is still there whenever she asks for it — this only puts the invitation away.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    await db.update(profiles).set({ planSetupSkippedAt: new Date() })
      .where(eq(profiles.id, ctx.profileId));
    return { ok: true, hint: "The invitation is gone. Offer run_plan_setup again if she asks to change her training." };
  },
});
