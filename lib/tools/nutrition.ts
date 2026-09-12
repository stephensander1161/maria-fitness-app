import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { wholeGrams, wholeGramsNullable, wholeGramsOptional } from "@/lib/whole-grams";
import { db } from "@/lib/db";
import { mealLogs, mealPlans, meals, profiles, weighIns, savedMeals,
} from "@/lib/db/schema";
import { planMeals, writeRecipe } from "@/lib/agent/planner";
import { APP_TIMEZONE, DAY_NAMES, dayIndex, FUTURE_DATE_ERROR, hourIn, isFuture, weekStart } from "@/lib/date";
import { factForDay, pickUnseenFact } from "@/lib/facts";
import { preferredTopic } from "@/lib/fact-timing";
import { nutritionTrend } from "@/lib/progress";
import { pantryStock, recentMeals } from "@/lib/views";
import { type ShoppingItem } from "@/lib/shopping";
import { instacartConfigured } from "@/lib/instacart";
import { foodUnitsFor, getProfileById, todayForProfile, ageFrom } from "@/lib/profile";
import { foodLines, gramsLabel, quantityLabel } from "@/lib/food-units";
import { itemCount, parsePortion, toGrams } from "@/lib/portion";
import { searchFoods } from "./foods";
import {
  directionMatchesGoal, FIBRE_TARGET_G, fibreForDay, fibrePer100, nutritionTargets, targetDirection,
} from "@/lib/nutrition";
import { cmToIn } from "@/lib/units";
import { desc } from "drizzle-orm";
import { compareStock, normaliseItem } from "@/lib/pantry";
import { shoppingListFor } from "@/lib/shopping-list";
import { audit } from "@/lib/audit";
import { consumeForMeal } from "./pantry";
import { defineTool, type ToolContext } from "./define";

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
  slow: "planner",
  description:
    "Builds the week's meal plan, or re-plans particular days of it. You set the targets; a dedicated planner writes the actual meals around her restrictions, dislikes and cooking confidence. Set a calorie target that produces a sustainable deficit (roughly 0.5–1% of body weight per week, never below 1200 kcal/day) and protein high enough to protect muscle while losing fat (about 1.6g per kg). Takes a few seconds. Without `days` it replaces the whole week; with `days` it touches only those and leaves the rest alone.",
  input: z.object({
    calorieTarget: wholeGrams,
    proteinTargetG: wholeGrams,
    notes: z.string().optional()
      .describe("Anything the planner should know — a busy week, batch cooking, something she fancies"),
    weekStart: z.string().optional().describe("YYYY-MM-DD Monday; defaults to this week"),
    days: z.array(z.number().int().min(0).max(6)).optional()
      .describe("Re-plan only these days, 0=Monday. Leave out for the whole week. Use it when she wants one day different — the other days keep the meals she already has, and their recipes."),
  }),
  handler: async (input, ctx) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "Profile not found." };

    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));

    let drafted;
    try {
      drafted = await planMeals(profile, { ...input, weekStart: week, days: input.days });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Meal planning failed." };
    }

    const only = drafted.days;
    // A one-day re-plan does not get to rewrite the week's write-up: that
    // paragraph is about the week, and a rationale for Thursday standing in
    // for it would describe a plan she is not looking at.
    const rationale = only === null ? drafted.rationale : undefined;

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
        ...(rationale === undefined ? {} : { rationale }),
      },
    }).returning();

    // One transaction: a half-written week is a plan row with no meals, which
    // renders as "no meal plan" while the targets say otherwise, and the
    // error the tool returns does not put the old meals back.
    await db.transaction(async (tx) => {
      // Scoped to the days asked for, so the rest of the week keeps its meals
      // and the recipes already written against them.
      await tx.delete(meals).where(only === null
        ? eq(meals.mealPlanId, plan.id)
        : and(eq(meals.mealPlanId, plan.id), inArray(meals.dayOfWeek, only)));
      if (drafted.meals.length) {
        await tx.insert(meals).values(drafted.meals.map((m, i) => ({
          mealPlanId: plan.id, dayOfWeek: m.dayOfWeek, slot: m.slot, title: m.title,
          calories: m.calories, proteinG: m.proteinG,
          carbsG: m.carbsG ?? null, fatG: m.fatG ?? null,
          ingredients: m.ingredients ?? [], steps: m.steps ?? [],
          prepMinutes: m.prepMinutes ?? null, sortOrder: i,
        })));
      }
    });

    return {
      ok: true,
      weekStart: week,
      days: only,
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
    calories: wholeGrams,
    proteinG: wholeGrams,
    carbsG: wholeGramsOptional,
    fatG: wholeGramsOptional,
    ingredients: z.array(z.string()).optional(),
    steps: z.array(z.string()).optional(),
    prepMinutes: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const mine = await herMeal(ctx.profileId, input.mealId);
    if (!mine) return { ok: false, error: "Meal not found — call get_meal_plan for current meal ids" };
    // The meal week's blurb described the week as planned. Swapping a meal
    // out of it makes that sentence a description of something else.
    await db.update(mealPlans).set({ rationale: null })
      .where(and(eq(mealPlans.id, mine.mealPlanId), isNotNull(mealPlans.rationale)));

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
  slow: "planner",
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

/**
 * A plate, priced from the library in one go.
 *
 * Each line goes through the same portion parser and the same search the
 * coach's `lookup_food` uses, so "4 cheese cubes" and "pickles" resolve
 * exactly as they would one call at a time — just without four model round
 * trips between them.
 *
 * Only the library. Estimating a miss would need the model, which is the
 * round trip this exists to avoid, so a miss is reported rather than guessed:
 * `unpriced` is what the caller has to tell her about.
 */
async function priceItems(items: string[], ctx: ToolContext): Promise<{
  kcal: number | null; proteinG: number | null; carbsG: number | null;
  fatG: number | null; fibreG: number | null;
  priced: { item: string; food: string; portion: string; kcal: number }[];
  unpriced: string[];
}> {
  const found: { item: string; food: string; portion: string; kcal: number }[] = [];
  const unpriced: string[] = [];
  let kcal = 0, proteinG = 0, carbsG = 0, fatG = 0;
  // Fibre is known only for some rows, and summing a null as zero is the bug
  // this app has caught more times than any other. It stays null unless every
  // priced line carried one.
  let fibreG = 0;
  let fibreKnownForAll = true;

  const units = await foodUnitsFor(ctx.profileId);
  for (const raw of items) {
    const portion = parsePortion(raw);
    if (!portion) { unpriced.push(raw); continue; }
    const [best] = await searchFoods(portion.query, 1);
    if (!best) { unpriced.push(raw); continue; }
    /*
      A menu item is counted; everything else is weighed.

      Same fork as `lookup_food`: a chain row carries per-item figures, so the
      multiplier is how many of them, and a weight nobody published is a
      refusal rather than a guess. `at` is the one place the two meet, so the
      lines below do not care which kind of row they got.
    */
    let at: (v: number) => number;
    /** How the portion reads back to her — "2 × Big Mac", or "110 g". */
    let label: string;
    if (best.perItem) {
      const n = itemCount(portion, best.unitGrams, best.unitLabel);
      if (n === null) { unpriced.push(raw); continue; }
      at = (v) => v * n;
      label = n === 1
        ? `1 ${best.unitLabel ?? "item"}`
        : `${Math.round(n * 10) / 10} × ${best.unitLabel ?? "item"}`;
    } else {
      const grams = portion.assumed && best.unitGrams !== null
        ? best.unitGrams
        : toGrams(portion, best.unitGrams, best.unitLabel);
      if (grams === null) { unpriced.push(raw); continue; }
      at = (v) => (v * grams) / 100;
      label = gramsLabel(grams, units);
    }
    kcal += at(best.kcal);
    proteinG += at(best.proteinG);
    carbsG += at(best.carbsG);
    fatG += at(best.fatG);
    /*
      The same rule the recipe cards use, which this had never used.

      An empty fibre column on a chicken breast means none, not unmeasured —
      so treating it as unknown made the day's fibre a floor forever: one
      protein shake and the bar is hatched for a figure that is genuinely
      zero. A legume with no figure is still a figure nobody has.
    */
    const fibrePer = fibrePer100(best);
    if (fibrePer === null) fibreKnownForAll = false;
    else fibreG += at(fibrePer);
    found.push({
      item: raw, food: best.name, portion: label, kcal: Math.round(at(best.kcal)),
    });
  }

  if (found.length === 0) {
    return { kcal: null, proteinG: null, carbsG: null, fatG: null, fibreG: null, priced: [], unpriced };
  }
  const round = (n: number) => Math.round(n);
  return {
    kcal: round(kcal), proteinG: round(proteinG), carbsG: round(carbsG), fatG: round(fatG),
    fibreG: fibreKnownForAll ? round(fibreG) : null,
    priced: found, unpriced,
  };
}

export const logMeal = defineTool({
  name: "log_meal",
  repeatable: "two of the same thing in a day is a real meal log — two coffees, the same snack twice",
  description:
    "Record what she actually ate, planned or not. **Pass `items` — the foods as she said them — and this prices the plate itself against the library, with no lookup_food calls at all.** That is one call instead of five and is the fastest path by a long way; only fall back to sending calories and protein yourself for something the library comes back empty on. For a restaurant meal, a takeaway or anything you genuinely cannot pin down, pass caloriesLow and caloriesHigh instead of pretending to a single number — the midpoint is logged, the range travels with it, and she is told it is an estimate. That is what keeps her logging on the days tracking usually breaks. Returns the day's running totals against target — no judgement, just the numbers.",
  input: z.object({
    slot: slotEnum,
    description: z.string(),
    items: z.array(z.string()).optional().describe(
      "Each food as she said it, with the amount if she gave one: ['pulled pork', '4 cheese cubes', 'pickles', 'bbq sauce']. Priced here against the library — no amount means one of the thing. Anything it cannot find comes back in `unpriced` and is not counted, so the total is a floor and you must say so.",
    ),
    calories: wholeGramsOptional,
    proteinG: wholeGramsOptional,
    /*
      All five or none, and the reason is what the screen does with a blank.

      A day's bar is a *floor* — hatched, no verdict — if a single entry on it
      is missing that macro, so one shake logged as calories and protein alone
      greys out carbs and fat for the whole day however carefully everything
      else was logged. That is the correct behaviour and it is why these
      descriptions now say so: a blank is not neutral, and the model was
      filling in two of five because nothing told it otherwise.

      "Estimate" is not "invent". If you know it is a protein shake you know
      roughly what is in one; if she said "dinner at Mum's" you do not, and
      leaving them out is right.
    */
    carbsG: wholeGramsOptional
      .describe("Grams of carbohydrate. Give it whenever you are giving calories — estimate it the same way you estimated those. A blank here makes the day's carb bar a floor with no verdict on it, for every entry."),
    fatG: wholeGramsOptional
      .describe("Grams of fat. Same rule as carbs: if you can put a calorie figure on it you can put a fat figure on it, and a blank greys out the day."),
    fibreG: wholeGramsOptional
      .describe("Grams of fibre. Estimate it when the lookup misses, exactly as you estimate carbs and fat — a rough figure logged beats a blank. Leave it out only when you genuinely have no idea what was in the meal."),
    caloriesLow: wholeGramsOptional
      .describe("Lower bound for a meal you cannot pin down — a restaurant plate, a friend's cooking. Pass the upper bound too."),
    caloriesHigh: wholeGramsOptional,
    mealId: z.string().optional().describe("If she ate the planned meal, pass its id"),
    date: z.string().optional(),
    clientKey: z.string().optional().describe(
      "Supplied by the app for retry safety. Leave this out.",
    ),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    if (isFuture(date, await todayForProfile(ctx.profileId))) return { ok: false, error: FUTURE_DATE_ERROR };
    /*
      Price the plate here, from the library, in one round trip.

      A four-item lunch was four `lookup_food` calls plus the model round trip
      to read them back plus this one — and the turn ran past its deadline
      before the write it existed to make, so the lunch was refused and the
      row was never written. The lookups are indexed queries against a local
      table; there is no reason for the model to be the thing that fans them
      out.

      Unknown is not zero: an item the library has no row for is *not* counted
      and comes back in `unpriced`, so the total is a floor and the coach says
      which part it could not price rather than quietly logging a small lunch.
    */
    const priced = input.items?.length ? await priceItems(input.items, ctx) : null;
    /*
      A partial sum is not a total, and writing one is the worst outcome here.

      Three of a four-item plate missing from the library would have logged the
      barbecue sauce and called the lunch 29 calories — a number that looks
      exact, sits on the Eat screen as her intake, and is wrong by six hundred.
      Recoverable rather than fatal, the same shape as an unknown exercise
      slug: nothing is written, the caller is told exactly which lines could
      not be priced, and it comes back with figures for those.
    */
    if (priced && priced.unpriced.length > 0 && input.calories === undefined
      && input.caloriesLow === undefined) {
      return {
        ok: false,
        unpriced: priced.unpriced,
        priced: priced.priced,
        error: `Nothing was logged. The library has no figures for: ${priced.unpriced.join(", ")}. `
          + `Look those up or estimate them, then call log_meal again with the same items plus `
          + `calories and proteinG for the whole plate.`,
      };
    }
    const planned = input.mealId ? await herMeal(ctx.profileId, input.mealId) : null;
    if (input.mealId && !planned) {
      return { ok: false, error: "That meal is not in the plan — log it without a mealId, or call get_meal_plan for the right one" };
    }
    // Same idempotency as log_set: a response lost on a dropped connection is
    // the normal shape of a gym basement, and the retry used to log the meal a
    // second time — and empty the kitchen a second time with it.
    const [row] = await db.insert(mealLogs).values({
      profileId: ctx.profileId, date, slot: input.slot, mealId: input.mealId ?? null,
      description: input.description,
      // A range logs its midpoint — the honest single number when the truth is
      // "somewhere between" — and keeps the bounds so nothing downstream
      // presents it as precise.
      calories: input.calories
        ?? priced?.kcal
        ?? (input.caloriesLow !== undefined && input.caloriesHigh !== undefined
          ? Math.round((input.caloriesLow + input.caloriesHigh) / 2)
          : null),
      proteinG: input.proteinG ?? priced?.proteinG ?? null,
      carbsG: input.carbsG ?? priced?.carbsG ?? null,
      fatG: input.fatG ?? priced?.fatG ?? null,
      fibreG: input.fibreG ?? priced?.fibreG ?? null,
      confidence: input.caloriesLow !== undefined && input.caloriesHigh !== undefined
        ? "range"
        : input.calories !== undefined ? "estimated" : null,
      caloriesLow: input.caloriesLow ?? null,
      caloriesHigh: input.caloriesHigh ?? null,
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

    /*
      Which of the five the row landed without.

      Said on the way out as well as in the input descriptions, because the
      description is read once at the start of a turn and this is read right
      after the write — and it is the moment the model can still offer to fill
      them in while she is looking at the meal.
    */
    const blanks = ([
      ["calories", row.calories], ["protein", row.proteinG], ["carbs", row.carbsG],
      ["fat", row.fatG], ["fibre", row.fibreG],
    ] as const).filter(([, v]) => v === null).map(([k]) => k);

    return {
      ok: true, date,
      logId: row.id,
      ...(blanks.length > 0 ? {
        loggedWithout: blanks,
        loggedWithoutMeans: `Those bars read as floors for the whole day now, not just for this entry. If you can estimate them, call update_meal_log with logId ${row.id} and fill them in.`,
      } : {}),
      // What the plate was priced at, line by line, so the reply can read it
      // back to her — and what could not be priced, which she has to be told
      // about because the meal's figure is a floor without it.
      ...(priced ? {
        pricedFrom: priced.priced,
        unpriced: priced.unpriced,
        mealIsAFloor: priced.unpriced.length > 0,
      } : {}),
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
      loggedAs: row.confidence === "range"
        ? `${row.caloriesLow}–${row.caloriesHigh} kcal, logged at the midpoint`
        : undefined,
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
    topic: z.enum(["sleep"]).optional().describe("A subject to prefer. Late at night this is preferred anyway."),
    revisit: z.boolean().optional()
      .describe("Prefer something she has already been shown over spending a new one from the library. The card under each screen asks this way, so moving around the app all afternoon doesn't burn a year of material."),
  }),
  handler: async (input, ctx) => {
    const profile = await getProfileById(ctx.profileId);
    const hour = hourIn(profile?.timezone ?? APP_TIMEZONE);
    const asOf = await todayForProfile(ctx.profileId);
    /*
      Two different asks wearing one name.

      The coach dropping a fact into a conversation wants one she has not read
      — that is the whole value of it. The card under a screen fires on every
      navigation, and at one new fact per screen a busy afternoon reads the
      library dry and marks all of it seen. `factForDay` is the version that
      re-reads: one genuinely new one a day, and after that anything she has
      already been shown.
    */
    const fact = input.revisit
      ? await factForDay(ctx.profileId, asOf, hour, input.category)
      : await pickUnseenFact(
          ctx.profileId, asOf, input.category,
          input.topic ?? preferredTopic(hour, Math.random()),
        );
    if (!fact) return { error: "No facts seeded yet." };
    return { category: fact.category, fact: fact.text, source: fact.source };
  },
});

export const logPlannedDay = defineTool({
  name: "log_planned_day",
  description:
    "Logs the day's planned meals as eaten, in one call — for when she says she ate the plan, ate everything, or stuck to it. Leaves alone any meal slot she has already logged something in, so it is safe to call twice and safe to call after she has logged breakfast herself; `skipped` names those slots and you should say so. Each meal takes its ingredients out of the kitchen exactly as logging it one at a time would. Returns what it logged and the day's totals; pass a date for a day she is catching up on.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
    slots: z.array(slotEnum).optional()
      .describe("Only these meals — 'I had the planned breakfast and lunch'. Omit for the whole day."),
    mealIds: z.array(z.string()).optional()
      .describe("Particular planned meals, by id from get_meal_plan. Naming one logs it even if that slot already has something in it — she pointed at it, so she means it."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;
    if (isFuture(date, her)) return { ok: false, error: FUTURE_DATE_ERROR };

    /*
      The plan for that day, scoped through the plan row.

      Same rule as `herMeal`: a meal id is only hers if the plan it belongs to
      is. Here the meals are found *from* her plan rather than looked up and
      checked afterwards, which is the version that cannot be got wrong.
    */
    const rows = await db.select({
      id: meals.id, slot: meals.slot, title: meals.title,
      calories: meals.calories, proteinG: meals.proteinG,
      carbsG: meals.carbsG, fatG: meals.fatG, ingredients: meals.ingredients,
    })
      .from(meals)
      .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
      .where(and(
        eq(mealPlans.profileId, ctx.profileId),
        eq(mealPlans.weekStart, weekStart(date)),
        eq(meals.dayOfWeek, dayIndex(date)),
      ));

    if (rows.length === 0) {
      return { ok: false, error: `Nothing is planned for ${date}, so there is nothing to log. Log what she actually ate with log_meal.` };
    }

    /*
      What is already down for that day.

      By *slot*, not by meal id — and that distinction is the whole thing. A
      meal she typed in herself carries no meal id, so matching on the id let
      this log a second breakfast on top of the one she had already written
      down: 2150 kcal for a 1730 kcal day, and the button's own copy promised
      it would not. If something is already in the slot, this leaves the slot
      alone and says how many it skipped.
    */
    const already = await db.select({ slot: mealLogs.slot })
      .from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));
    const taken = new Set(already.map((r) => r.slot));

    /*
      Naming a meal overrides the slot guard.

      The guard exists for "I ate the plan", where the honest default on a slot
      she has already filled is to leave it alone. Tapping one meal is not that
      request — it is her saying "this one, now" — and refusing it because the
      slot has a snack in it would be the app arguing with her. The retry key
      still holds: the same meal cannot land twice on the same day.
    */
    const byId = input.mealIds?.length ? new Set(input.mealIds) : null;
    const wanted = input.slots?.length ? new Set(input.slots) : null;
    const todo = byId
      ? rows.filter((m) => byId.has(m.id))
      : rows.filter((m) => !taken.has(m.slot) && (!wanted || wanted.has(m.slot)));

    if (byId && todo.length === 0) {
      return { ok: false, error: `None of those meals are in her plan for ${date}. Call get_meal_plan for the right ids.` };
    }

    const done: { slot: string; title: string; calories: number }[] = [];
    for (const m of todo) {
      const [row] = await db.insert(mealLogs).values({
        profileId: ctx.profileId, date, slot: m.slot, mealId: m.id,
        description: m.title,
        calories: m.calories, proteinG: m.proteinG,
        carbsG: m.carbsG, fatG: m.fatG,
        // The planner writes calories and macros, never fibre. Null rather
        // than 0: the day's fibre stays a floor and says so, exactly as it
        // does for a meal described in words.
        fibreG: null,
        confidence: "library",
        // One key per meal per day, so a double tap or a retried request
        // cannot log the same planned meal twice.
        clientKey: `planned:${ctx.profileId}:${date}:${m.id}`,
      }).onConflictDoNothing({ target: mealLogs.clientKey }).returning();
      if (!row) continue;
      done.push({ slot: m.slot, title: m.title, calories: m.calories });
      // Eating a planned meal empties part of the kitchen, the same as
      // logging it one at a time does.
      await consumeForMeal(ctx.profileId, m.ingredients);
    }

    const dayRows = await db.select({
      calories: mealLogs.calories, proteinG: mealLogs.proteinG, fibreG: mealLogs.fibreG,
    }).from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));
    const counted = dayRows.filter((r) => r.calories !== null);
    const fibre = fibreForDay(dayRows);

    return {
      ok: true,
      date,
      logged: done,
      /** Planned meals left alone because that slot already had something in
          it. Tell her which, so a skipped meal is never a silent one. */
      skipped: byId ? [] : rows.filter((m) => taken.has(m.slot)).map((m) => m.slot),
      dayCalories: counted.reduce((n, r) => n + (r.calories ?? 0), 0),
      dayProteinG: dayRows.reduce((n, r) => n + (r.proteinG ?? 0), 0),
      caloriesAreComplete: counted.length === dayRows.length,
      dayFibreG: fibre.grams,
      fibreIsCompleteForDay: fibre.complete,
    };
  },
});

/**
 * Split a plate written in words into the things on it.
 *
 * "2x cheese quesadillas and 2x pickles" is two items; "protein shake" is one.
 * Deliberately crude — it only has to be good enough for the library lookup to
 * find something, and anything it cannot price is reported rather than guessed.
 */
export function plateItems(description: string): string[] {
  return description
    .split(/\s*(?:,|\band\b|\bwith\b|\+|&)\s*/i)
    // "2x cheese quesadillas" is two quesadillas. The portion parser reads the
    // "x" as the unit and hands "x cheese quesadillas" to the library, which
    // finds nothing — so a plate written the way people write plates came back
    // unrecognised. Real entry, real miss.
    .map((x) => x.trim().replace(/^(\d+(?:\.\d+)?)\s*x\s+/i, "$1 "))
    .filter((x) => x.length > 1);
}

/**
 * The most the library figure may be stretched to meet her calorie figure.
 *
 * An entry already carrying calories is the anchor: if the library prices the
 * words at 300 kcal and she logged 450, the plate was bigger than the lookup
 * assumed and the macros scale with it. Past this the two are not describing
 * the same food — the lookup matched the wrong row — and scaling would invent
 * a number rather than recover one. Refuse and say so.
 */
const FILL_SCALE_MIN = 0.4;
const FILL_SCALE_MAX = 2.5;

export const fillMacroGaps = defineTool({
  name: "fill_macro_gaps",
  description:
    "Fills in macros an entry was logged without, by pricing what she wrote against the food library — use it when carbs, fat or fibre are missing from a day, or when she asks why a bar is greyed out. Only ever fills blanks: a figure she or you already put in is never overwritten. Two things it leaves alone and names separately, because they need different answers: food the library cannot recognise (`couldNotPrice`) and food it recognises but has no figure for (`noFigureInLibrary`, usually fibre in a dairy or meat row). A guess is worse than a gap. Costs nothing and answers instantly.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD. Defaults to today."),
    logId: z.string().optional().describe("Just this one entry. Omit for the whole day."),
  }),
  handler: async (input, ctx) => {
    const her = await todayForProfile(ctx.profileId);
    const date = input.date ?? her;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: `"${date}" is not a date. Use YYYY-MM-DD.` };

    const rows = await db.select().from(mealLogs)
      .where(input.logId
        ? and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.id, input.logId))
        : and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));
    if (rows.length === 0) return { ok: false, error: "Nothing logged to fill in." };

    const filled: { description: string; added: string[] }[] = [];
    const couldNotPrice: string[] = [];
    /*
      Recognised, but with nothing to give for the gap that was left.

      Kept apart from `couldNotPrice` because they are different problems with
      different answers. The library has no fibre figure for cheese, so a
      quesadilla missing only fibre is not a food it failed to find — telling
      her it was would send her off correcting something that is not wrong.
    */
    const noFigureInLibrary: string[] = [];

    for (const row of rows) {
      const gaps = (["calories", "proteinG", "carbsG", "fatG", "fibreG"] as const)
        .filter((k) => row[k] === null);
      if (gaps.length === 0) continue;

      const priced = await priceItems(plateItems(row.description), ctx);
      if (priced.kcal === null) { couldNotPrice.push(row.description); continue; }
      /*
        Part of a plate is not the plate.

        "2x cheese quesadillas and 2x pickles" prices the pickles and not the
        quesadillas, which leaves two figures that are both wrong: the macros
        cover a tenth of the meal, and the calorie anchor below would scale
        them by forty-five trying to reach 450. Writing 0.7g of fibre for that
        plate is a floor wearing a figure's clothes, which is the one thing
        this app must not do. All of it, or none of it.
      */
      if (priced.unpriced.length > 0) { couldNotPrice.push(row.description); continue; }

      /*
        Her calorie figure anchors the portion.

        The library prices the *words*, which carry no amount half the time —
        "cheese quesadillas" is one quesadilla to the parser. An entry that
        already has calories says how much of it there actually was, so the
        macros scale to meet it. Without one, the library's own portion is the
        best available answer and is used unscaled.
      */
      let scale = 1;
      if (row.calories !== null && priced.kcal > 0) {
        scale = row.calories / priced.kcal;
        if (scale < FILL_SCALE_MIN || scale > FILL_SCALE_MAX) {
          // Not the same food. The lookup matched the wrong row, and scaling
          // it would invent a number rather than recover one.
          couldNotPrice.push(row.description);
          continue;
        }
      }

      const at = (v: number | null) => (v === null ? null : Math.round(v * scale));
      const next: Record<string, number> = {};
      const added: string[] = [];
      for (const [key, label, value] of [
        ["calories", "calories", priced.kcal], ["proteinG", "protein", priced.proteinG],
        ["carbsG", "carbs", priced.carbsG], ["fatG", "fat", priced.fatG],
        ["fibreG", "fibre", priced.fibreG],
      ] as const) {
        if (!gaps.includes(key)) continue;
        const v = at(value);
        // Null stays null: the library has no fibre figure for plenty of rows
        // and writing a zero there is the bug this app has caught most often.
        if (v === null) continue;
        next[key] = v;
        added.push(label);
      }
      if (added.length === 0) { noFigureInLibrary.push(row.description); continue; }

      // Blanks only, in the update itself: a figure she typed cannot be
      // overwritten by a race with something else writing the same row.
      await db.update(mealLogs).set(next)
        .where(and(
          eq(mealLogs.id, row.id),
          eq(mealLogs.profileId, ctx.profileId),
          ...(gaps.includes("calories") ? [isNull(mealLogs.calories)] : []),
        ));
      filled.push({ description: row.description, added });
    }

    const day = await db.select({
      calories: mealLogs.calories, proteinG: mealLogs.proteinG, carbsG: mealLogs.carbsG,
      fatG: mealLogs.fatG, fibreG: mealLogs.fibreG,
    }).from(mealLogs)
      .where(and(eq(mealLogs.profileId, ctx.profileId), eq(mealLogs.date, date)));
    const complete = (k: "calories" | "proteinG" | "carbsG" | "fatG" | "fibreG") =>
      day.length > 0 && day.every((r) => r[k] !== null);

    return {
      ok: true,
      date,
      filled,
      couldNotPrice,
      noFigureInLibrary,
      stillAFloor: (["calories", "proteinG", "carbsG", "fatG", "fibreG"] as const)
        .filter((k) => !complete(k)),
      hint: couldNotPrice.length > 0
        ? "Those are not in the library. Estimate them yourself and pass them to update_meal_log rather than leaving the day a floor."
        : noFigureInLibrary.length > 0
          ? "The library recognised those but carries no figure for what was missing — usually fibre in a dairy or meat row. Estimate it if you can; leave it if you cannot."
          : undefined,
    };
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
    age: ageFrom(profile.birthYear, await todayForProfile(profileId)) ?? 30,
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
    "Corrects something she already logged eating — the calories, the protein, or what it was. Use it when she says a figure was off ('that curry was more like 800') rather than logging a second entry, which leaves the day wrong in a different way, and use it to fill in a macro an earlier entry went in without: one blank greys out that bar for the whole day. Call get_day_nutrition for the logId. Only the fields you pass change; leave the rest out.",
  input: z.object({
    logId: z.string().describe("From get_day_nutrition or log_meal"),
    description: z.string().optional(),
    calories: wholeGramsNullable,
    proteinG: wholeGramsNullable,
    carbsG: wholeGramsNullable,
    fatG: wholeGramsNullable,
    fibreG: wholeGramsNullable
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

export const saveMeal = defineTool({
  name: "save_meal",
  description:
    "Keeps a meal she eats often so logging it later is one tap — her porridge, her usual lunch, the shake she has after training. Pass the numbers if they are known and leave them out if they are not; 'leftovers' is a perfectly good thing to save and carries no figures. Saving the same thing twice just updates it. Use it when she says something is a regular, or after working out a meal she is clearly going to eat again.",
  input: z.object({
    slot: slotEnum.describe("Where it usually goes; she can still log it anywhere"),
    description: z.string().min(1),
    calories: wholeGramsNullable,
    proteinG: wholeGramsNullable,
    fibreG: wholeGramsNullable
      .describe("Only when actually known — from lookup_food, not a guess."),
  }),
  handler: async (input, ctx) => {
    const description = input.description.trim();
    const [row] = await db.insert(savedMeals)
      .values({
        profileId: ctx.profileId,
        slot: input.slot,
        description,
        calories: input.calories ?? null,
        proteinG: input.proteinG ?? null,
        fibreG: input.fibreG ?? null,
      })
      .onConflictDoUpdate({
        target: [savedMeals.profileId, savedMeals.slot, savedMeals.description],
        set: {
          calories: input.calories ?? null,
          proteinG: input.proteinG ?? null,
          fibreG: input.fibreG ?? null,
        },
      })
      .returning();
    return { ok: true, saved: row.description, slot: row.slot };
  },
});

export const listSavedMeals = defineTool({
  name: "list_saved_meals",
  description:
    "The meals she has saved as regulars, most recently used first. Read it before suggesting what she could eat — something she has already told us she eats often beats anything from the library, and it means not asking her again for numbers she has already given.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await db.select().from(savedMeals)
      .where(eq(savedMeals.profileId, ctx.profileId))
      .orderBy(desc(savedMeals.lastUsedAt), asc(savedMeals.description));
    return {
      meals: rows.map((r) => ({
        id: r.id, slot: r.slot, description: r.description,
        calories: r.calories, proteinG: r.proteinG, fibreG: r.fibreG,
      })),
      note: rows.length === 0
        ? "Nothing saved yet — save_meal keeps one when she mentions a regular."
        : undefined,
    };
  },
});

export const removeSavedMeal = defineTool({
  name: "remove_saved_meal",
  description:
    "Takes a meal off her saved list — she has gone off it, or it was saved by mistake. Matched on what it is called; her logged entries are untouched, because this is the shortcut and not the record.",
  input: z.object({
    description: z.string().describe("As it appears in list_saved_meals"),
  }),
  handler: async (input, ctx) => {
    const gone = await db.delete(savedMeals)
      .where(and(
        eq(savedMeals.profileId, ctx.profileId),
        sql`lower(${savedMeals.description}) = ${input.description.trim().toLowerCase()}`,
      ))
      .returning({ description: savedMeals.description });
    if (gone.length === 0) return { ok: false, error: "Nothing saved by that name — call list_saved_meals." };
    return { ok: true, removed: gone.map((g) => g.description) };
  },
});
