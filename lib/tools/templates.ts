import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { mealPlans, mealTemplates, profiles, workoutTemplates } from "@/lib/db/schema";
import { weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import {
  instantiateMealPlan, instantiateWorkoutPlan, pickMealTemplate, pickWorkoutTemplate,
} from "@/lib/templates";
import { defineTool } from "./define";

export const listTemplates = defineTool({
  name: "list_templates",
  description:
    "The ready-made training weeks and meal plans available, with what each suits. Use this when she wants something different rather than a bespoke rebuild — swapping to a lighter template is instant, where generating a new week takes the better part of a minute.",
  input: z.object({
    kind: z.enum(["training", "meals"]).optional().describe("Omit for both"),
  }),
  handler: async (input) => {
    const out: Record<string, unknown> = {};
    if (input.kind !== "meals") {
      out.training = (await db.select().from(workoutTemplates)).map((t) => ({
        slug: t.slug, name: t.name, suits: t.description,
        daysPerWeek: t.daysPerWeek, sessionMinutes: t.sessionMinutes,
        equipment: t.equipment, worksAround: t.avoids,
      }));
    }
    if (input.kind !== "training") {
      out.meals = (await db.select().from(mealTemplates)).map((t) => ({
        slug: t.slug, name: t.name, suits: t.description,
        baseCalories: t.baseCalories, dietary: t.dietaryTags, cooking: t.cookingSkill,
      }));
    }
    return out;
  },
});

export const applyTemplate = defineTool({
  name: "apply_template",
  description:
    "Replace her week with a ready-made template, by slug from list_templates. Instant, unlike create_weekly_plan. Use it when she wants to change wholesale — fewer days, less equipment, a different style — and adjust individual days afterwards if she wants.",
  input: z.object({
    trainingSlug: z.string().optional().describe("A training template slug, if changing that"),
    mealSlug: z.string().optional().describe("A meal template slug, if changing that"),
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };
    if (!input.trainingSlug && !input.mealSlug) {
      return { ok: false, error: "Name a training or meal template slug." };
    }

    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const applied: string[] = [];

    if (input.trainingSlug) {
      const [t] = await db.select().from(workoutTemplates)
        .where(eq(workoutTemplates.slug, input.trainingSlug)).limit(1);
      if (!t) return { ok: false, error: `No training template '${input.trainingSlug}'.` };
      await instantiateWorkoutPlan(profile.id, t, week);
      applied.push(t.name);
    }

    if (input.mealSlug) {
      const [t] = await db.select().from(mealTemplates)
        .where(eq(mealTemplates.slug, input.mealSlug)).limit(1);
      if (!t) return { ok: false, error: `No meal template '${input.mealSlug}'.` };
      // Keep whatever targets she is already working to; only the meals change.
      const [existing] = await db.select().from(mealPlans)
        .where(eq(mealPlans.profileId, profile.id)).limit(1);
      await instantiateMealPlan(
        profile.id, t, week,
        existing?.calorieTarget ?? t.baseCalories,
        existing?.proteinTargetG ?? t.baseProteinG,
      );
      applied.push(t.name);
    }

    return { ok: true, applied, weekStart: week };
  },
});

export const suggestTemplate = defineTool({
  name: "suggest_template",
  description:
    "The template that best fits her profile right now — days available, equipment, experience, and anything she's told you hurts. Use it before apply_template when she asks for a change but hasn't said which.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { error: "Profile not found." };

    const [existing] = await db.select().from(mealPlans)
      .where(eq(mealPlans.profileId, profile.id)).limit(1);

    const [training, meal] = await Promise.all([
      pickWorkoutTemplate(profile),
      pickMealTemplate(profile, existing?.calorieTarget ?? 1600),
    ]);

    return {
      training: training && { slug: training.slug, name: training.name, why: training.description },
      meals: meal && { slug: meal.slug, name: meal.name, why: meal.description },
    };
  },
});
