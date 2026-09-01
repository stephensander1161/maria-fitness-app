import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { mealLogs, mealPlans, meals, profiles, weighIns } from "@/lib/db/schema";
import { planMeals } from "@/lib/agent/planner";
import { DAY_NAMES, dayIndex, FUTURE_DATE_ERROR, isFuture, weekStart } from "@/lib/date";
import { pickUnseenFact } from "@/lib/facts";
import { nutritionTrend } from "@/lib/progress";
import { recentMeals } from "@/lib/views";
import { todayForProfile } from "@/lib/profile";
import {
  directionMatchesGoal, FIBRE_TARGET_G, fibreForDay, nutritionTargets, targetDirection,
} from "@/lib/nutrition";
import { cmToIn } from "@/lib/units";
import { desc } from "drizzle-orm";
import { defineTool } from "./define";

const slotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const createMealPlan = defineTool({
  name: "create_meal_plan",
  description:
    "Build the week's meal plan. You set the targets; a dedicated planner writes the actual meals around her restrictions, dislikes and cooking confidence. Set a calorie target that produces a sustainable deficit (roughly 0.5–1% of body weight per week, never below 1200 kcal/day) and protein high enough to protect muscle while losing fat (about 1.6g per kg). Takes a few seconds. Re-running for the same week replaces it.",
  input: z.object({
    calorieTarget: z.number(),
    proteinTargetG: z.number(),
    notes: z.string().optional()
      .describe("Anything the planner should know — a busy week, batch cooking, something she fancies"),
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    const week = input.weekStart ?? weekStart();

    let drafted;
    try {
      drafted = await planMeals(profile, { ...input, weekStart: week });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Meal planning failed." };
    }

    const [plan] = await db.insert(mealPlans).values({
      profileId: ctx.profileId, weekStart: week,
      calorieTarget: drafted.calorieTarget, proteinTargetG: drafted.proteinTargetG,
      carbTargetG: drafted.carbTargetG ?? null, fatTargetG: drafted.fatTargetG ?? null,
      rationale: drafted.rationale,
    }).onConflictDoUpdate({
      target: [mealPlans.profileId, mealPlans.weekStart],
      set: {
        calorieTarget: drafted.calorieTarget, proteinTargetG: drafted.proteinTargetG,
        carbTargetG: drafted.carbTargetG ?? null, fatTargetG: drafted.fatTargetG ?? null,
        rationale: drafted.rationale,
      },
    }).returning();

    await db.delete(meals).where(eq(meals.mealPlanId, plan.id));
    if (drafted.meals.length) {
      await db.insert(meals).values(drafted.meals.map((m, i) => ({
        mealPlanId: plan.id, dayOfWeek: m.dayOfWeek, slot: m.slot, title: m.title,
        calories: m.calories, proteinG: m.proteinG,
        carbsG: m.carbsG ?? null, fatG: m.fatG ?? null,
        ingredients: m.ingredients ?? [], steps: m.steps ?? [],
        prepMinutes: m.prepMinutes ?? null, sortOrder: i,
      })));
    }

    return {
      ok: true,
      weekStart: week,
      meals: drafted.meals.length,
      calorieTarget: drafted.calorieTarget,
      proteinTargetG: drafted.proteinTargetG,
      rationale: drafted.rationale,
      // Whether the target you chose actually points where she is going. Not a
      // clamp — a surplus is right when she asked for one — but if this says
      // the direction contradicts her goal, say so to her before anything else.
      ...(await describeIntent(ctx.profileId, drafted.calorieTarget)),
      // Surfaced rather than hidden: if a day is off target she should hear it
      // from you, not discover it by being hungry.
      daysOffTarget: drafted.shortfalls,
    };
  },
});

export const getMealPlan = defineTool({
  name: "get_meal_plan",
  description:
    "The meal plan for a week — targets plus every meal by day and slot, with ingredients and steps. Use before answering 'what am I eating today?' or building a shopping list.",
  input: z.object({
    weekStart: z.string().optional(),
    dayOfWeek: z.number().optional().describe("Limit to one day; 0=Monday"),
  }),
  handler: async (input, ctx) => {
    const week = input.weekStart ?? weekStart();
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, week))).limit(1);
    if (!plan) return { exists: false, weekStart: week, hint: "No meal plan yet — call create_meal_plan." };

    const rows = await db.select().from(meals)
      .where(eq(meals.mealPlanId, plan.id)).orderBy(meals.dayOfWeek, meals.sortOrder);
    const filtered = input.dayOfWeek === undefined ? rows : rows.filter((m) => m.dayOfWeek === input.dayOfWeek);

    return {
      exists: true, weekStart: week,
      calorieTarget: plan.calorieTarget, proteinTargetG: plan.proteinTargetG,
      carbTargetG: plan.carbTargetG, fatTargetG: plan.fatTargetG,
      rationale: plan.rationale, todayIsDayOfWeek: dayIndex(),
      meals: filtered.map((m) => ({
        id: m.id, dayName: DAY_NAMES[m.dayOfWeek], dayOfWeek: m.dayOfWeek, slot: m.slot,
        title: m.title, calories: m.calories, proteinG: m.proteinG,
        carbsG: m.carbsG, fatG: m.fatG, prepMinutes: m.prepMinutes,
        ingredients: m.ingredients, steps: m.steps,
      })),
    };
  },
});

export const swapMeal = defineTool({
  name: "swap_meal",
  description:
    "Replace a planned meal she doesn't want. Choose the replacement yourself — you already know her restrictions, her disliked foods, her cooking confidence, and the calories and protein the slot needs — then call this and tell her what you swapped it to. Only ask her first if she named a specific craving or you have no idea what she'd eat. Keep calories and protein close so the week's targets still hold.",
  input: z.object({
    mealId: z.string(),
    title: z.string(),
    calories: z.number(),
    proteinG: z.number(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    ingredients: z.array(z.string()).optional(),
    steps: z.array(z.string()).optional(),
    prepMinutes: z.number().optional(),
  }),
  handler: async (input) => {
    const [row] = await db.update(meals).set({
      title: input.title, calories: input.calories, proteinG: input.proteinG,
      carbsG: input.carbsG ?? null, fatG: input.fatG ?? null,
      ingredients: input.ingredients ?? [], steps: input.steps ?? [],
      prepMinutes: input.prepMinutes ?? null,
    }).where(eq(meals.id, input.mealId)).returning();
    if (!row) return { ok: false, error: "Meal not found" };
    return { ok: true, title: row.title };
  },
});

export const logMeal = defineTool({
  name: "log_meal",
  description:
    "Record what she actually ate, planned or not. Estimate calories and protein when she describes food in words. Returns the day's running totals against target — no judgement, just the numbers.",
  input: z.object({
    slot: slotEnum,
    description: z.string(),
    calories: z.number().optional(),
    proteinG: z.number().optional(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    fibreG: z.number().optional()
      .describe("Only when you actually know it — from lookup_food, not a guess. Omitting it is correct and expected; a wrong figure here is worse than none."),
    mealId: z.string().optional().describe("If she ate the planned meal, pass its id"),
    date: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    if (isFuture(date, await todayForProfile(ctx.profileId))) return { ok: false, error: FUTURE_DATE_ERROR };
    await db.insert(mealLogs).values({
      profileId: ctx.profileId, date, slot: input.slot, mealId: input.mealId ?? null,
      description: input.description,
      calories: input.calories ?? null, proteinG: input.proteinG ?? null,
      carbsG: input.carbsG ?? null, fatG: input.fatG ?? null,
      fibreG: input.fibreG ?? null,
    });

    const dayRows = await db.select({
      calories: mealLogs.calories, proteinG: mealLogs.proteinG, fibreG: mealLogs.fibreG,
    }).from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));

    const totals = {
      calories: dayRows.reduce((n, r) => n + (r.calories ?? 0), 0),
      protein: dayRows.reduce((n, r) => n + (r.proteinG ?? 0), 0),
    };
    const fibre = fibreForDay(dayRows);

    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, weekStart(date)))).limit(1);

    return {
      ok: true, date,
      todayCalories: totals.calories, todayProteinG: totals.protein,
      calorieTarget: plan?.calorieTarget ?? null,
      proteinTargetG: plan?.proteinTargetG ?? null,
      caloriesRemaining: plan ? plan.calorieTarget - totals.calories : null,
      proteinRemainingG: plan ? plan.proteinTargetG - totals.protein : null,
      // Fibre is known only for food looked up against the library. Never
      // present this as her day's fibre unless fibreIsCompleteForToday — say
      // "at least Xg, from the N items we have figures for" instead.
      todayFibreG: fibre.grams,
      fibreTargetG: FIBRE_TARGET_G,
      fibreIsCompleteForToday: fibre.complete,
      fibreUnknownForItems: fibre.unknownFor,
    };
  },
});

export const getDayNutrition = defineTool({
  name: "get_day_nutrition",
  description: "Everything she logged eating on a date, with totals against the day's targets.",
  input: z.object({ date: z.string().optional() }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const rows = await db.select().from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)))
      .orderBy(mealLogs.createdAt);
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, weekStart(date)))).limit(1);
    const calories = rows.reduce((n, r) => n + (r.calories ?? 0), 0);
    const protein = rows.reduce((n, r) => n + (r.proteinG ?? 0), 0);
    const fibre = fibreForDay(rows);
    return {
      date,
      logged: rows.map((r) => ({
        slot: r.slot, description: r.description,
        calories: r.calories, proteinG: r.proteinG,
        carbsG: r.carbsG, fatG: r.fatG, fibreG: r.fibreG,
      })),
      calories, proteinG: protein,
      calorieTarget: plan?.calorieTarget ?? null, proteinTargetG: plan?.proteinTargetG ?? null,
      // See log_meal: a null fibreG means we do not know, not zero. Treating
      // the sum as her day's fibre under-reports every meal she typed in words.
      fibreG: fibre.grams,
      fibreTargetG: FIBRE_TARGET_G,
      fibreIsCompleteForDay: fibre.complete,
      fibreUnknownForItems: fibre.unknownFor,
    };
  },
});

export const getFact = defineTool({
  name: "get_fact",
  description:
    "Pull a fitness or health fact she hasn't seen recently — strength, nutrition, recovery, women's health, or the risks of a sedentary lifestyle. Drop one in naturally when it lands on something she just did or asked about; never open with one twice in a row.",
  input: z.object({
    category: z.enum(["sedentary_risk", "strength", "nutrition", "recovery", "motivation", "womens_health"])
      .optional().describe("Omit to let it pick"),
  }),
  handler: async (input, ctx) => {
    const fact = await pickUnseenFact(ctx.profileId, input.category);
    if (!fact) return { error: "No facts seeded yet." };
    return { category: fact.category, fact: fact.text, source: fact.source };
  },
});

export const removeMealLog = defineTool({
  name: "remove_meal_log",
  description:
    "Delete something she logged eating — a mistake, a double entry, or food she ended up not eating. Call get_day_nutrition first if you need the id. Returns the day's totals afterwards so you can tell her where she now stands.",
  input: z.object({
    logId: z.string().describe("From get_day_nutrition"),
  }),
  handler: async (input, ctx) => {
    // Scoped to her profile in the delete itself: an id from anywhere else
    // matches nothing rather than deleting someone's row.
    const [gone] = await db.delete(mealLogs)
      .where(and(eq(mealLogs.id, input.logId), eq(mealLogs.profileId, ctx.profileId)))
      .returning();

    if (!gone) return { ok: false, error: "No such entry — it may already be gone." };

    const rows = await db.select({
      calories: mealLogs.calories, proteinG: mealLogs.proteinG, fibreG: mealLogs.fibreG,
    }).from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, gone.date)));

    const fibre = fibreForDay(rows);
    return {
      ok: true,
      removed: { description: gone.description, slot: gone.slot, date: gone.date },
      date: gone.date,
      todayCalories: rows.reduce((n, r) => n + (r.calories ?? 0), 0),
      todayProteinG: rows.reduce((n, r) => n + (r.proteinG ?? 0), 0),
      todayFibreG: fibre.grams,
      fibreIsCompleteForToday: fibre.complete,
    };
  },
});

/**
 * How the chosen calorie target relates to her own maintenance and her goal.
 *
 * Returns an empty object when her numbers are incomplete, because a direction
 * derived from a missing height is worse than no direction at all.
 */
async function describeIntent(profileId: string, calorieTarget: number) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile?.heightCm || !profile.birthYear || !profile.sex) return {};

  const [latest] = await db.select().from(weighIns)
    .where(eq(weighIns.profileId, profileId)).orderBy(desc(weighIns.date)).limit(1);
  const currentKg = latest?.weightKg ?? profile.startWeightKg;
  if (!currentKg) return {};

  const { maintenanceCalories } = nutritionTargets({
    weightKg: currentKg,
    heightIn: cmToIn(profile.heightCm),
    age: new Date().getFullYear() - profile.birthYear,
    sex: profile.sex,
    daysPerWeek: profile.daysPerWeek ?? 3,
    units: "imperial",
  });

  const direction = targetDirection(calorieTarget, maintenanceCalories);
  const matchesGoal = directionMatchesGoal(direction, currentKg, profile.goalWeightKg);

  return {
    maintenanceEstimate: maintenanceCalories,
    direction,
    directionMatchesHerGoal: matchesGoal,
    ...(matchesGoal === false && {
      warning:
        `This target is a ${direction} against an estimated ${maintenanceCalories} kcal ` +
        `maintenance, but her goal weight is ${profile.goalWeightKg}kg and she is ` +
        `${currentKg.toFixed(1)}kg. Tell her the plan points the other way and why, ` +
        `or rebuild it — do not present it as progress toward her goal.`,
    }),
  };
}

export const getNutritionTrend = defineTool({
  name: "get_nutrition_trend",
  description:
    "How her eating has actually gone over recent days — calories and protein per day against target, which days she logged, and a plain headline. Use it for 'how have I been eating?', before adjusting her targets, and whenever you are about to comment on why the scale has or has not moved. Days she did not log are marked as unlogged rather than counted as zero, so read daysLogged before drawing any conclusion.",
  input: z.object({
    days: z.number().optional().describe("Window length; defaults to 14"),
  }),
  handler: async (input, ctx) => {
    const trend = await nutritionTrend(
      ctx.profileId,
      Math.min(60, Math.max(3, input.days ?? 14)),
      await todayForProfile(ctx.profileId),
    );
    return {
      headline: trend.headline,
      trend: trend.trend,
      daysLogged: trend.daysLogged,
      windowDays: trend.windowDays,
      calorieTarget: trend.calorieTarget,
      proteinTargetG: trend.proteinTargetG,
      avgCaloriesOnLoggedDays: trend.avgCalories,
      avgProteinOnLoggedDays: trend.avgProteinG,
      daysAtOrUnderCalorieTarget: trend.daysOnTarget,
      // A null means she logged nothing that day. It is not a zero-calorie day,
      // and treating it as one invents a deficit she never ran.
      days: trend.days.map((d) => ({
        date: d.date,
        calories: d.logged ? d.calories : null,
        proteinG: d.logged ? d.proteinG : null,
        logged: d.logged,
      })),
    };
  },
});

export const getRecentMeals = defineTool({
  name: "get_recent_meals",
  description:
    "The meals she logs most often, with the calories and protein she last recorded for each. Use it to offer her usual instead of asking her to describe food again — 'your usual porridge and berries?' — and to log a repeat without making her retype it. Most-repeated first.",
  input: z.object({
    slot: slotEnum.optional().describe("Limit to one meal of the day"),
    limit: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const all = await recentMeals(ctx.profileId, {
      limit: Math.min(20, input.limit ?? 6),
      from: await todayForProfile(ctx.profileId),
    });
    const meals = input.slot ? all.filter((m) => m.slot === input.slot) : all;
    return {
      meals: meals.map((m) => ({
        slot: m.slot, description: m.description,
        calories: m.calories, proteinG: m.proteinG, fibreG: m.fibreG,
        timesLogged: m.times, lastEaten: m.lastEaten,
      })),
      hint: meals.length === 0
        ? "Nothing logged recently — she has no usuals yet."
        : "Pass these straight to log_meal to repeat one; do not ask her to describe it again.",
    };
  },
});
