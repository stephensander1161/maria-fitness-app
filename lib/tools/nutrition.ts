import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { mealLogs, mealPlans, meals, profiles, weighIns } from "@/lib/db/schema";
import { planMeals, writeRecipe } from "@/lib/agent/planner";
import { DAY_NAMES, dayIndex, FUTURE_DATE_ERROR, isFuture, weekStart } from "@/lib/date";
import { pickUnseenFact } from "@/lib/facts";
import { nutritionTrend } from "@/lib/progress";
import { pantryStock, recentMeals } from "@/lib/views";
import { type ShoppingItem } from "@/lib/shopping";
import { instacartConfigured } from "@/lib/instacart";
import { foodUnitsFor, todayForProfile } from "@/lib/profile";
import { foodLines, quantityLabel } from "@/lib/food-units";
import {
  directionMatchesGoal, FIBRE_TARGET_G, fibreForDay, nutritionTargets, targetDirection,
} from "@/lib/nutrition";
import { cmToIn } from "@/lib/units";
import { desc } from "drizzle-orm";
import { compareStock, normaliseItem } from "@/lib/pantry";
import { shoppingListFor } from "@/lib/shopping-list";
import { audit } from "@/lib/audit";
import { consumeForMeal } from "./pantry";
import { defineTool } from "./define";

const slotEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

/**
 * A meal row, only if it sits in one of her meal plans.
 *
 * `meals` has no profile column — ownership is one join away through
 * `meal_plans` — and swap_meal used to update by meal id alone. Anyone signed
 * in could rewrite another account's meal through /api/action with a leaked
 * id. Every tool that takes a meal id resolves it through here.
 */
async function herMeal(profileId: string, mealId: string) {
  const [row] = await db.select()
    .from(meals)
    .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
    .where(and(eq(meals.id, mealId), eq(mealPlans.profileId, profileId)))
    .limit(1);
  return row?.meals ?? null;
}

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

    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));

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
    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, week))).limit(1);
    if (!plan) return { exists: false, weekStart: week, hint: "No meal plan yet — call create_meal_plan." };

    const rows = await db.select().from(meals)
      .where(eq(meals.mealPlanId, plan.id)).orderBy(meals.dayOfWeek, meals.sortOrder);
    const filtered = input.dayOfWeek === undefined ? rows : rows.filter((m) => m.dayOfWeek === input.dayOfWeek);
    const fu = await foodUnitsFor(ctx.profileId);

    return {
      exists: true, weekStart: week,
      calorieTarget: plan.calorieTarget, proteinTargetG: plan.proteinTargetG,
      carbTargetG: plan.carbTargetG, fatTargetG: plan.fatTargetG,
      rationale: plan.rationale, todayIsDayOfWeek: dayIndex(await todayForProfile(ctx.profileId)),
      foodUnits: fu,
      meals: filtered.map((m) => ({
        id: m.id, dayName: DAY_NAMES[m.dayOfWeek], dayOfWeek: m.dayOfWeek, slot: m.slot,
        title: m.title, calories: m.calories, proteinG: m.proteinG,
        carbsG: m.carbsG, fatG: m.fatG, prepMinutes: m.prepMinutes,
        ingredients: foodLines(m.ingredients, fu), steps: foodLines(m.steps, fu),
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
  handler: async (input, ctx) => {
    const mine = await herMeal(ctx.profileId, input.mealId);
    if (!mine) return { ok: false, error: "Meal not found — call get_meal_plan for current meal ids" };
    const [row] = await db.update(meals).set({
      title: input.title, calories: input.calories, proteinG: input.proteinG,
      carbsG: input.carbsG ?? null, fatG: input.fatG ?? null,
      ingredients: input.ingredients ?? [], steps: input.steps ?? [],
      prepMinutes: input.prepMinutes ?? null,
    }).where(eq(meals.id, mine.id)).returning();
    if (!row) return { ok: false, error: "Meal not found" };
    return { ok: true, title: row.title };
  },
});

export const getMealRecipe = defineTool({
  name: "get_meal_recipe",
  description:
    "The ingredients and method for one planned meal, in her measures. If the meal was planned without a recipe, this writes one to fit its calories and protein and saves it onto the meal, so asking again is free. Use it when she wants to know how to make something in her plan.",
  input: z.object({
    mealId: z.string().describe("From get_meal_plan"),
  }),
  handler: async (input, ctx) => {
    const meal = await herMeal(ctx.profileId, input.mealId);
    if (!meal) return { ok: false, error: "Meal not found — call get_meal_plan for current meal ids" };

    const fu = await foodUnitsFor(ctx.profileId);
    const out = (m: typeof meal, written: boolean) => ({
      ok: true as const, written, mealId: m.id, title: m.title,
      calories: m.calories, proteinG: m.proteinG, prepMinutes: m.prepMinutes,
      ingredients: foodLines(m.ingredients, fu), steps: foodLines(m.steps, fu),
    });

    if (meal.ingredients.length > 0 && meal.steps.length > 0) return out(meal, false);

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    let drafted;
    try {
      drafted = await writeRecipe(profile, meal);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not write that recipe." };
    }

    // Only ever fills a blank. Two taps in quick succession both draft, but the
    // first to land is the one that is kept — the second cannot overwrite a
    // recipe she is already reading, and neither can this quietly replace a
    // recipe the planner or a swap wrote.
    await db.update(meals)
      .set({
        ingredients: drafted.ingredients,
        steps: drafted.steps,
        prepMinutes: meal.prepMinutes ?? drafted.prepMinutes ?? null,
      })
      .where(and(
        eq(meals.id, meal.id),
        sql`jsonb_array_length(${meals.steps}) = 0 or jsonb_array_length(${meals.ingredients}) = 0`,
      ));

    const saved = await herMeal(ctx.profileId, meal.id);
    return out(saved ?? meal, true);
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
    clientKey: z.string().optional().describe(
      "Supplied by the app for retry safety. Leave this out.",
    ),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    if (isFuture(date, await todayForProfile(ctx.profileId))) return { ok: false, error: FUTURE_DATE_ERROR };
    const planned = input.mealId ? await herMeal(ctx.profileId, input.mealId) : null;
    if (input.mealId && !planned) {
      return { ok: false, error: "That mealId is not in her plan — log it without mealId, or call get_meal_plan for the right one" };
    }
    // Same idempotency as log_set: a response lost on a dropped connection is
    // the normal shape of a gym basement, and the retry used to log the meal a
    // second time — and empty the kitchen a second time with it.
    const [row] = await db.insert(mealLogs).values({
      profileId: ctx.profileId, date, slot: input.slot, mealId: input.mealId ?? null,
      description: input.description,
      calories: input.calories ?? null, proteinG: input.proteinG ?? null,
      carbsG: input.carbsG ?? null, fatG: input.fatG ?? null,
      fibreG: input.fibreG ?? null,
      clientKey: input.clientKey ?? null,
    }).onConflictDoNothing({ target: mealLogs.clientKey }).returning();

    if (!row) {
      // Her own retry landing twice. Report the day as it stands rather than
      // an error — from her side the first attempt simply worked.
      const rows = await db.select({ calories: mealLogs.calories })
        .from(mealLogs)
        .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));
      const known = rows.filter((r) => r.calories !== null);
      return {
        ok: true, duplicate: true, date,
        todayCalories: known.reduce((n, r) => n + (r.calories ?? 0), 0),
        caloriesAreComplete: known.length === rows.length,
      };
    }

    // Eating a planned meal empties part of the kitchen. Only for a planned
    // meal: a sentence she typed carries no ingredient list, and guessing what
    // came out of the cupboard would be worse than not knowing.
    let kitchen: { touched: number } | null = null;
    if (planned) kitchen = await consumeForMeal(ctx.profileId, planned.ingredients);

    const dayRows = await db.select({
      calories: mealLogs.calories, proteinG: mealLogs.proteinG, fibreG: mealLogs.fibreG,
    }).from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));

    // Floors, not totals: an entry logged in words carries no figure, and
    // adding it in as zero is the same bug as counting an unlogged day as zero.
    const counted = dayRows.filter((r) => r.calories !== null);
    const totals = {
      calories: counted.reduce((n, r) => n + (r.calories ?? 0), 0),
      protein: dayRows.reduce((n, r) => n + (r.proteinG ?? 0), 0),
      knownFor: counted.length,
      unknownFor: dayRows.length - counted.length,
    };
    const fibre = fibreForDay(dayRows);

    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, weekStart(date)))).limit(1);

    return {
      ok: true, date,
      logId: row.id,
      todayCalories: totals.calories, todayProteinG: totals.protein,
      // Never state todayCalories as her intake when this is false — it is a
      // floor. Say "at least X, and N entries have no figures".
      caloriesAreComplete: totals.unknownFor === 0,
      caloriesUnknownForItems: totals.unknownFor,
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
      /** Ingredients taken out of her kitchen by logging this, if any. */
      pantryLinesUpdated: kitchen?.touched ?? 0,
    };
  },
});

export const getDayNutrition = defineTool({
  name: "get_day_nutrition",
  description:
    "Everything she logged eating on a date, with totals against the day's targets and the id of each entry so it can be corrected or removed. `calories` is a floor whenever `caloriesAreComplete` is false — some of what she ate was described in words and carries no figures, so say 'at least' rather than reading it as her intake.",
  input: z.object({ date: z.string().optional() }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const rows = await db.select().from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)))
      .orderBy(mealLogs.createdAt);
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, weekStart(date)))).limit(1);
    const counted = rows.filter((r) => r.calories !== null);
    const calories = counted.reduce((n, r) => n + (r.calories ?? 0), 0);
    const protein = rows.reduce((n, r) => n + (r.proteinG ?? 0), 0);
    const fibre = fibreForDay(rows);
    return {
      date,
      logged: rows.map((r) => ({
        // The id remove_meal_log and update_meal_log need. Without it the tool
        // existed and was unreachable: its own description said to call this
        // first for the id, and this did not return one.
        logId: r.id,
        slot: r.slot, description: r.description,
        calories: r.calories, proteinG: r.proteinG,
        carbsG: r.carbsG, fatG: r.fatG, fibreG: r.fibreG,
      })),
      calories, proteinG: protein,
      caloriesAreComplete: counted.length === rows.length,
      caloriesKnownForItems: counted.length,
      caloriesUnknownForItems: rows.length - counted.length,
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
    category: z.enum(["sedentary_risk", "strength", "nutrition", "recovery", "motivation", "womens_health", "postpartum"])
      .optional().describe("Omit to let it pick"),
  }),
  handler: async (input, ctx) => {
    const fact = await pickUnseenFact(
      ctx.profileId, await todayForProfile(ctx.profileId), input.category,
    );
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

export const updateMealLog = defineTool({
  name: "update_meal_log",
  description:
    "Corrects something she already logged eating — the calories, the protein, or what it was. Use it when she says a figure was off ('that curry was more like 800') rather than logging a second entry, which leaves the day wrong in a different way. Call get_day_nutrition for the logId. Only the fields you pass change; leave the rest out.",
  input: z.object({
    logId: z.string().describe("From get_day_nutrition or log_meal"),
    description: z.string().optional(),
    calories: z.number().nullable().optional(),
    proteinG: z.number().nullable().optional(),
    carbsG: z.number().nullable().optional(),
    fatG: z.number().nullable().optional(),
    fibreG: z.number().nullable().optional()
      .describe("Only when actually known. Pass null to say we do not know, which is not zero."),
  }),
  handler: async (input, ctx) => {
    const [row] = await db.select().from(mealLogs)
      .where(and(eq(mealLogs.id, input.logId), eq(mealLogs.profileId, ctx.profileId)))
      .limit(1);
    if (!row) return { ok: false, error: "No entry with that id — call get_day_nutrition for the day's ids." };

    // Undefined means "leave alone"; null means "we do not know", which is a
    // value this app carries deliberately and must be writable.
    const patch = {
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.calories === undefined ? {} : { calories: input.calories }),
      ...(input.proteinG === undefined ? {} : { proteinG: input.proteinG }),
      ...(input.carbsG === undefined ? {} : { carbsG: input.carbsG }),
      ...(input.fatG === undefined ? {} : { fatG: input.fatG }),
      ...(input.fibreG === undefined ? {} : { fibreG: input.fibreG }),
    };
    if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change." };

    const [updated] = await db.update(mealLogs).set(patch)
      .where(eq(mealLogs.id, row.id)).returning();

    const dayRows = await db.select({ calories: mealLogs.calories })
      .from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, row.date)));
    const counted = dayRows.filter((r) => r.calories !== null);

    return {
      ok: true,
      date: row.date,
      was: { description: row.description, calories: row.calories, proteinG: row.proteinG },
      now: { description: updated.description, calories: updated.calories, proteinG: updated.proteinG },
      todayCalories: counted.reduce((n, r) => n + (r.calories ?? 0), 0),
      caloriesAreComplete: counted.length === dayRows.length,
    };
  },
});

export const clearMealLogs = defineTool({
  name: "clear_meal_logs",
  description:
    "Removes everything she logged eating on a day, or one slot of it — 'wipe yesterday, I was testing', 'take breakfast off, I logged it twice'. It is her record and hers to reset; say what was removed and offer to put it back. Only the food log is touched: her meal plan and her kitchen are untouched.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    slot: slotEnum.optional().describe("Only this meal of the day"),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const where = [eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)];
    if (input.slot) where.push(eq(mealLogs.slot, input.slot));

    const rows = await db.select({ id: mealLogs.id, description: mealLogs.description })
      .from(mealLogs).where(and(...where));
    if (rows.length === 0) {
      return { ok: false, error: `Nothing logged for ${date}${input.slot ? ` at ${input.slot}` : ""}.` };
    }

    await db.delete(mealLogs).where(and(...where));
    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "meal_logs", date, slot: input.slot ?? null, items: rows.length },
    });
    return { ok: true, date, removed: rows.length, slot: input.slot ?? null };
  },
});

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

export const getShoppingList = defineTool({
  name: "get_shopping_list",
  description:
    "Everything the week's meals need, added up and grouped by aisle, with what her kitchen already holds marked against it. Use it when she asks what to buy, is planning a shop, or wants to know whether a swap changes the list. Quantities are added only where the units match — the list is for shopping from, so a handful stays a handful — and weights and volumes come back in her food units. Each item carries an `inKitchen` status: only 'missing', 'out' and 'short' actually need buying, and 'unknown' means the amount was never counted, so ask rather than assume. The result says whether Instacart is connected; if it is, send_shopping_list_to_instacart turns the list into a cart.",
  input: z.object({
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
    fromDayOfWeek: z.number().optional().describe("Only from this day onward, 0=Monday — for a mid-week top-up shop"),
  }),
  handler: async (input, ctx) => {
    const list = await shoppingListFor(ctx.profileId, input);
    const instacart = instacartConfigured();
    if (!list.exists) return { exists: false, weekStart: list.weekStart, instacart, hint: "No meal plan for that week yet." };
    const fu = await foodUnitsFor(ctx.profileId);

    // What she already has, so the list can stop asking her to buy it. Status
    // by item and unit, never a bare boolean: "some, uncounted" is not "have".
    const stock = await pantryStock(ctx.profileId);
    const marks = new Map(
      compareStock(
        list.aisles.flatMap((a) => a.items.map((i) => ({ ...i }))),
        stock,
      ).map((l) => [`${normaliseItem(l.item)}::${l.unit ?? ""}`, l]),
    );
    const markOf = (i: ShoppingItem) => marks.get(`${normaliseItem(i.item)}::${i.unit ?? ""}`);

    return {
      exists: true,
      weekStart: list.weekStart,
      mealsCovered: list.mealsCovered,
      totalItems: list.aisles.reduce((n, a) => n + a.items.length, 0),
      foodUnits: fu,
      instacart,
      aisles: list.aisles.map((a) => ({
        aisle: a.aisle,
        items: a.items.map((i) => {
          const mark = markOf(i);
          return {
            item: i.item,
            // Written out rather than left as a number and a unit, so it can be
            // read straight back to her — in her kitchen's units.
            quantity: i.amount === null ? null : quantityLabel(i.amount, i.unit, fu),
            fromMeals: i.fromMeals,
            inKitchen: mark?.status ?? "missing",
            /** Only ever set when both sides were counted in the same measure. */
            shortBy: mark?.shortBy === null || mark?.shortBy === undefined
              ? null
              : quantityLabel(mark.shortBy, i.unit, fu),
          };
        }),
      })),
    };
  },
});
