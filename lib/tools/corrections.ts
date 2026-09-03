import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  complaints, cycleEvents, factViews, feedback, goals, mealLogs, mealPlans, meals, measurements,
  messages, pantryItems, photos, planDays, planExercises, plans, preppedPortions, profiles,
  setLogs, shoppingExtras, weighIns, workouts,
} from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { weekStart } from "@/lib/date";
import { todayForProfile } from "@/lib/profile";
import { defineTool } from "./define";

/**
 * Undoing things.
 *
 * Almost every table in this app could be written to and not corrected, which
 * meant the coach's honest answer to "delete that, it was a mistake" was no —
 * and a coach that says no to a reasonable request about her own data is one
 * she stops asking. Everything here is scoped to her profile in the query
 * itself, and anything that destroys data calls audit().
 */

export const removeWeighIn = defineTool({
  name: "remove_weigh_in",
  description:
    "Removes a weigh-in — she stood on the scale in shoes, or logged it twice, or it was after dinner. Defaults to today's. Log weight upserts by date, so without this the only way to fix one was to stand on the scale again.",
  input: z.object({ date: z.string().optional().describe("YYYY-MM-DD; defaults to today") }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const [row] = await db.delete(weighIns)
      .where(and(eq(weighIns.profileId, ctx.profileId), eq(weighIns.date, date)))
      .returning();
    if (!row) return { ok: false, error: `No weigh-in logged on ${date}.` };
    await audit("data.deleted", { detail: { profileId: ctx.profileId, scope: "weigh_in", date } });
    return { ok: true, date, note: "The trend recalculates without it." };
  },
});

export const deleteWorkout = defineTool({
  name: "delete_workout",
  description:
    "Removes a whole logged session and every set in it — a day she was testing the app, or a session logged against the wrong date. Use delete_set for a single set. This changes her streak and her week review, so say what it removed.",
  input: z.object({ date: z.string().describe("YYYY-MM-DD") }),
  handler: async (input, ctx) => {
    const rows = await db.select({ id: workouts.id, title: workouts.title })
      .from(workouts)
      .where(and(eq(workouts.profileId, ctx.profileId), eq(workouts.date, input.date)));
    if (rows.length === 0) return { ok: false, error: `Nothing logged on ${input.date}.` };

    const ids = rows.map((r) => r.id);
    const [{ sets }] = await db.select({ sets: sql<number>`count(*)::int` })
      .from(setLogs).where(inArray(setLogs.workoutId, ids));

    await db.delete(setLogs).where(inArray(setLogs.workoutId, ids));
    await db.delete(workouts).where(inArray(workouts.id, ids));
    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "workout", date: input.date, sets },
    });
    return { ok: true, date: input.date, sessions: rows.length, setsRemoved: sets };
  },
});

export const removeMeasurement = defineTool({
  name: "remove_measurement",
  description:
    "Removes a tape reading — the guide itself says erratic numbers are usually the tape moving, and this is the moment she says so. Takes a date, and a site to remove just one of them.",
  input: z.object({
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    site: z.string().optional().describe("waist, hips, chest… omit for every site that day"),
  }),
  handler: async (input, ctx) => {
    const date = input.date ?? (await todayForProfile(ctx.profileId));
    const where = [eq(measurements.profileId, ctx.profileId), eq(measurements.date, date)];
    if (input.site) where.push(eq(measurements.site, input.site));

    const removed = await db.delete(measurements).where(and(...where)).returning();
    if (removed.length === 0) {
      return { ok: false, error: `No measurement on ${date}${input.site ? ` for ${input.site}` : ""}.` };
    }
    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "measurement", date, sites: removed.length },
    });
    return { ok: true, date, removed: removed.map((r) => r.site) };
  },
});

export const updateGoal = defineTool({
  name: "update_goal",
  description:
    "Changes a milestone she has already set — the number, the title, the date — or reopens one marked hit by mistake. Editing used to mean setting a second goal, which left both on the list and neither right.",
  input: z.object({
    goalId: z.string().describe("From list_goals"),
    title: z.string().optional(),
    targetValue: z.number().optional(),
    targetDate: z.string().nullable().optional().describe("Pass null to drop the deadline"),
    reopen: z.boolean().optional().describe("True to un-mark one that was hit"),
  }),
  handler: async (input, ctx) => {
    const [row] = await db.select().from(goals)
      .where(and(eq(goals.id, input.goalId), eq(goals.profileId, ctx.profileId))).limit(1);
    if (!row) return { ok: false, error: "No milestone with that id — call list_goals." };

    const patch = {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.targetValue === undefined ? {} : { targetValue: input.targetValue }),
      ...(input.targetDate === undefined ? {} : { targetDate: input.targetDate }),
      ...(input.reopen ? { achievedAt: null } : {}),
    };
    if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change." };

    const [updated] = await db.update(goals).set(patch).where(eq(goals.id, row.id)).returning();
    return {
      ok: true,
      was: { title: row.title, targetValue: row.targetValue, achieved: row.achievedAt !== null },
      now: { title: updated.title, targetValue: updated.targetValue, achieved: updated.achievedAt !== null },
    };
  },
});

export const removeGoal = defineTool({
  name: "remove_goal",
  description:
    "Takes a milestone off her list — one that no longer fits, or one set by mistake. Use update_goal to change it instead when she still wants it.",
  input: z.object({ goalId: z.string() }),
  handler: async (input, ctx) => {
    const [row] = await db.delete(goals)
      .where(and(eq(goals.id, input.goalId), eq(goals.profileId, ctx.profileId)))
      .returning();
    if (!row) return { ok: false, error: "No milestone with that id — call list_goals." };
    return { ok: true, removed: row.title };
  },
});

export const addShoppingExtra = defineTool({
  name: "add_shopping_extra",
  description:
    "Adds something to the shopping list that no meal asked for — coffee, washing-up liquid, her husband's cereal. The list is built from the week's meals, so this is the only way anything else gets on it, and it goes to Instacart with the rest. Add it for one week or for every week.",
  input: z.object({
    items: z.array(z.string()).min(1).describe("As she said them: 'coffee', '2 tins tomatoes'"),
    everyWeek: z.boolean().optional().describe("True to keep it on the list until she removes it"),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const week = input.everyWeek
      ? null
      : input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const rows = await db.insert(shoppingExtras)
      .values(input.items.map((item) => ({ profileId: ctx.profileId, item: item.trim(), weekStart: week })))
      .returning();
    return {
      ok: true,
      added: rows.map((r) => r.item),
      everyWeek: week === null,
    };
  },
});

export const removeShoppingExtra = defineTool({
  name: "remove_shopping_extra",
  description:
    "Takes something off the shopping list that she added by hand. Only removes extras — the items the week's meals need come off by changing the meals.",
  input: z.object({ item: z.string() }),
  handler: async (input, ctx) => {
    const wanted = input.item.trim().toLowerCase();
    const rows = await db.select().from(shoppingExtras)
      .where(eq(shoppingExtras.profileId, ctx.profileId));
    const match = rows.filter((r) => r.item.trim().toLowerCase() === wanted);
    if (match.length === 0) return { ok: false, error: `"${input.item}" is not one of her added items.` };
    await db.delete(shoppingExtras).where(inArray(shoppingExtras.id, match.map((r) => r.id)));
    return { ok: true, removed: input.item };
  },
});

export const clearPlan = defineTool({
  name: "clear_plan",
  description:
    "Empties a training week — every planned day and movement, leaving the sessions she has already logged alone. Use it when she wants to start the week over rather than adjust it. create_weekly_plan writes a new one afterwards.",
  input: z.object({ weekStart: z.string().optional() }),
  handler: async (input, ctx) => {
    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select().from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, week))).limit(1);
    if (!plan) return { ok: false, error: `No training plan for the week of ${week}.` };

    // Sessions survive: workouts.planDayId is set null on delete, and what she
    // actually did is not the plan's to remove.
    await db.delete(plans).where(eq(plans.id, plan.id));
    await audit("data.deleted", { detail: { profileId: ctx.profileId, scope: "plan", weekStart: week } });
    return {
      ok: true, weekStart: week,
      note: "Sessions she already logged are untouched. Call create_weekly_plan for a new week.",
    };
  },
});

export const copyWeek = defineTool({
  name: "copy_week",
  description:
    "Copies a training week onto another week, exactly as it was — same days, same movements, same targets. Instant and free, where create_weekly_plan takes the best part of a minute and may come back different. Use it when she says 'same as last week'.",
  input: z.object({
    fromWeekStart: z.string().optional().describe("Defaults to last week"),
    toWeekStart: z.string().optional().describe("Defaults to this week"),
  }),
  handler: async (input, ctx) => {
    const today = await todayForProfile(ctx.profileId);
    const to = input.toWeekStart ?? weekStart(today);
    const from = input.fromWeekStart ?? weekStart(
      new Date(Date.parse(`${to}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10),
    );
    if (from === to) return { ok: false, error: "Those are the same week." };

    const [source] = await db.select().from(plans)
      .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, from))).limit(1);
    if (!source) return { ok: false, error: `No training plan for the week of ${from}.` };

    const days = await db.select().from(planDays).where(eq(planDays.planId, source.id));
    const items = days.length
      ? await db.select().from(planExercises)
          .where(inArray(planExercises.planDayId, days.map((d) => d.id)))
      : [];

    // One transaction: a copy that half-lands leaves her with a plan of empty
    // days, which reads as a week with nothing in it.
    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: plans.id }).from(plans)
        .where(and(eq(plans.profileId, ctx.profileId), eq(plans.weekStart, to))).limit(1);
      if (existing) await tx.delete(plans).where(eq(plans.id, existing.id));

      const [copy] = await tx.insert(plans).values({
        profileId: ctx.profileId, weekStart: to, title: source.title, rationale: source.rationale,
      }).returning();

      for (const day of days) {
        const [newDay] = await tx.insert(planDays).values({
          planId: copy.id, dayOfWeek: day.dayOfWeek, title: day.title, focus: day.focus,
          isRest: day.isRest, notes: day.notes,
        }).returning();
        const forDay = items.filter((i) => i.planDayId === day.id);
        if (forDay.length > 0) {
          await tx.insert(planExercises).values(forDay.map((i) => ({
            planDayId: newDay.id, exerciseId: i.exerciseId, targetSets: i.targetSets,
            targetReps: i.targetReps, targetWeightKg: i.targetWeightKg,
            restSeconds: i.restSeconds, notes: i.notes, sortOrder: i.sortOrder,
          })));
        }
      }
    });

    return {
      ok: true, from, to, days: days.length, movements: items.length,
      hint: "Loads are the same as that week's. get_next_targets adjusts them from what she has since logged.",
    };
  },
});

export const removePlannedMeal = defineTool({
  name: "remove_planned_meal",
  description:
    "Takes a meal off her plan — she doesn't eat breakfast, or that day is a takeaway. The day's totals go down with it, which is the honest result. swap_meal replaces one instead.",
  input: z.object({ mealId: z.string().describe("From get_meal_plan") }),
  handler: async (input, ctx) => {
    const [row] = await db.select({ id: meals.id, title: meals.title, slot: meals.slot })
      .from(meals)
      .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
      .where(and(eq(meals.id, input.mealId), eq(mealPlans.profileId, ctx.profileId)))
      .limit(1);
    if (!row) return { ok: false, error: "Meal not found — call get_meal_plan for current ids." };

    await db.delete(meals).where(eq(meals.id, row.id));
    return { ok: true, removed: row.title, slot: row.slot };
  },
});

export const addPlannedMeal = defineTool({
  name: "add_planned_meal",
  description:
    "Adds a meal to a day of her plan — a second snack on training days, a breakfast she wants back. Write ingredients and steps in metric; the app shows them in her kitchen's units. Keep the day's total near her calorie target.",
  input: z.object({
    dayOfWeek: z.number().describe("0=Monday … 6=Sunday"),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    title: z.string(),
    calories: z.number(),
    proteinG: z.number(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    ingredients: z.array(z.string()).optional(),
    steps: z.array(z.string()).optional(),
    prepMinutes: z.number().optional(),
    weekStart: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const week = input.weekStart ?? weekStart(await todayForProfile(ctx.profileId));
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.profileId, ctx.profileId), eq(mealPlans.weekStart, week))).limit(1);
    if (!plan) return { ok: false, error: `No meal plan for the week of ${week} — call create_meal_plan first.` };

    const [row] = await db.insert(meals).values({
      mealPlanId: plan.id, dayOfWeek: input.dayOfWeek, slot: input.slot, title: input.title,
      calories: input.calories, proteinG: input.proteinG,
      carbsG: input.carbsG ?? null, fatG: input.fatG ?? null,
      ingredients: input.ingredients ?? [], steps: input.steps ?? [],
      prepMinutes: input.prepMinutes ?? null,
      sortOrder: { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }[input.slot],
    }).returning();

    return { ok: true, mealId: row.id, title: row.title, dayOfWeek: row.dayOfWeek, slot: row.slot };
  },
});

export const deleteProgressPhotos = defineTool({
  name: "delete_progress_photos",
  description:
    "Removes progress photos in bulk — all of them, or everything before a date, or one pose. These are photographs of her body and hers to delete on the spot; one-at-a-time was not an answer she should ever have been given. Say how many went.",
  input: z.object({
    all: z.boolean().optional(),
    before: z.string().optional().describe("YYYY-MM-DD"),
    pose: z.string().optional().describe("front, side, back"),
  }),
  handler: async (input, ctx) => {
    if (!input.all && !input.before && !input.pose) {
      return { ok: false, error: "Say which: all, before a date, or one pose." };
    }
    const where = [eq(photos.profileId, ctx.profileId)];
    if (input.before) where.push(lte(photos.date, input.before));
    if (input.pose) where.push(eq(photos.pose, input.pose as "front" | "side" | "back"));

    const removed = await db.delete(photos).where(and(...where)).returning({ id: photos.id });
    if (removed.length === 0) return { ok: false, error: "No photos matched that." };

    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "photos", count: removed.length },
    });
    return { ok: true, removed: removed.length };
  },
});

export const clearRange = defineTool({
  name: "clear_range",
  description:
    "Removes what she logged across a range of days — 'I was ill last week, wipe it'. Choose what to clear: sessions, food, weigh-ins, measurements, or all of them. Her plan and her kitchen are untouched. Tell her exactly what went, per kind.",
  input: z.object({
    fromDate: z.string().describe("YYYY-MM-DD"),
    toDate: z.string().describe("YYYY-MM-DD"),
    what: z.array(z.enum(["workouts", "meals", "weighIns", "measurements"])).optional()
      .describe("Omit for all four"),
  }),
  handler: async (input, ctx) => {
    const kinds = input.what?.length ? input.what : ["workouts", "meals", "weighIns", "measurements"];
    const from = input.fromDate;
    const to = input.toDate;
    if (from > to) return { ok: false, error: "Those dates are the wrong way round." };

    const removed: Record<string, number> = {};

    if (kinds.includes("workouts")) {
      const ids = (await db.select({ id: workouts.id }).from(workouts)
        .where(and(eq(workouts.profileId, ctx.profileId), gte(workouts.date, from), lte(workouts.date, to))))
        .map((r) => r.id);
      if (ids.length) {
        await db.delete(setLogs).where(inArray(setLogs.workoutId, ids));
        await db.delete(workouts).where(inArray(workouts.id, ids));
      }
      removed.workouts = ids.length;
    }
    if (kinds.includes("meals")) {
      const rows = await db.delete(mealLogs)
        .where(and(eq(mealLogs.profileId, ctx.profileId), gte(mealLogs.date, from), lte(mealLogs.date, to)))
        .returning({ id: mealLogs.id });
      removed.meals = rows.length;
    }
    if (kinds.includes("weighIns")) {
      const rows = await db.delete(weighIns)
        .where(and(eq(weighIns.profileId, ctx.profileId), gte(weighIns.date, from), lte(weighIns.date, to)))
        .returning({ id: weighIns.id });
      removed.weighIns = rows.length;
    }
    if (kinds.includes("measurements")) {
      const rows = await db.delete(measurements)
        .where(and(eq(measurements.profileId, ctx.profileId), gte(measurements.date, from), lte(measurements.date, to)))
        .returning({ id: measurements.id });
      removed.measurements = rows.length;
    }

    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "range", from, to, removed },
    });
    return { ok: true, from, to, removed };
  },
});

export const forgetConversation = defineTool({
  name: "forget_conversation",
  description:
    "Clears the coach's memory of what has been said — all of it, or everything before a date. Her logged data is untouched: this is the conversation only. Use it when she asks you to forget something, and tell her plainly that the coach will not remember what came before.",
  input: z.object({
    before: z.string().optional().describe("YYYY-MM-DD; omit to clear the whole conversation"),
  }),
  handler: async (input, ctx) => {
    const where = [eq(messages.profileId, ctx.profileId)];
    if (input.before) where.push(lte(messages.createdAt, new Date(`${input.before}T00:00:00Z`)));

    const removed = await db.delete(messages).where(and(...where)).returning({ id: messages.id });
    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "messages", count: removed.length, before: input.before ?? null },
    });
    return {
      ok: true,
      removed: removed.length,
      note: "Her training and food data are untouched — this was the conversation only.",
    };
  },
});


/**
 * Every profile-scoped table, in one place.
 *
 * Listing them out rather than leaning on the cascade from `profiles`: the
 * profile row has to survive, because it is what the account points at. Each
 * one is deleted by profile id in the query itself — the standing rule for
 * anything that destroys data.
 *
 * Two are deliberately absent. `usage_daily` is the spend ledger, and wiping
 * it would turn "clear my data" into a way to reset the daily budget and keep
 * spending. `audit_log` survives a reset by design; a record that can erase
 * its own history is not a record.
 */
const OWNED = [
  { table: setLogs, via: "workout" as const },
  { table: workouts, via: "profile" as const },
  { table: plans, via: "profile" as const },
  { table: mealPlans, via: "profile" as const },
  { table: mealLogs, via: "profile" as const },
  { table: weighIns, via: "profile" as const },
  { table: measurements, via: "profile" as const },
  { table: photos, via: "profile" as const },
  { table: goals, via: "profile" as const },
  { table: pantryItems, via: "profile" as const },
  { table: preppedPortions, via: "profile" as const },
  { table: shoppingExtras, via: "profile" as const },
  { table: complaints, via: "profile" as const },
  { table: cycleEvents, via: "profile" as const },
  { table: factViews, via: "profile" as const },
  { table: feedback, via: "profile" as const },
  { table: messages, via: "profile" as const },
];

export const eraseAllData = defineTool({
  name: "erase_all_my_data",
  description:
    "Clears everything she has ever logged and returns the app to the state it was in before she signed up — training, food, weigh-ins, measurements, photos, plans, the kitchen and the whole conversation. Her account and password survive, so she can sign back in and start over. This cannot be undone and there is no backup she can reach, so say that plainly and get a clear yes before calling it. It requires the literal confirmation string, which she has to give.",
  input: z.object({
    confirm: z.literal("erase everything").describe(
      "Exactly 'erase everything'. Ask her to say it; do not supply it yourself.",
    ),
  }),
  handler: async (_input, ctx) => {
    // Scoped in the query itself, every time — the profile row survives
    // because the account points at it, so the cascade cannot be relied on.
    let removed = 0;
    for (const { table, via } of OWNED) {
      const rows = via === "workout"
        ? await db.delete(table).where(
            inArray(
              // set_logs has no profile column; ownership is a join away.
              setLogs.workoutId,
              db.select({ id: workouts.id }).from(workouts).where(eq(workouts.profileId, ctx.profileId)),
            ),
          ).returning({ id: table.id })
        : await db.delete(table).where(eq(table.profileId, ctx.profileId)).returning({ id: table.id });
      removed += rows.length;
    }

    // Back to a blank intake. Onboarding re-asks everything it sets, so this
    // only has to clear the fields that decide whether she has been through
    // it — and the ones that would otherwise be quietly wrong for a person
    // starting again.
    await db.update(profiles).set({
      onboardedAt: null,
      planSetupAt: null,
      planSetupSkippedAt: null,
      birthYear: null,
      sex: null,
      heightCm: null,
      startWeightKg: null,
      goalWeightKg: null,
      goalDate: null,
      motivation: null,
      activityLevel: null,
      experience: null,
      daysPerWeek: null,
      sessionMinutes: null,
      cookingSkill: null,
      equipment: [],
      injuries: [],
      dietaryRestrictions: [],
      dislikedFoods: [],
      maintenanceUntil: null,
      tempEquipment: null,
      tempEquipmentUntil: null,
    }).where(eq(profiles.id, ctx.profileId));

    // Recorded after the wipe, in the one log a reset does not touch.
    await audit("data.deleted", {
      detail: { profileId: ctx.profileId, scope: "everything", rows: removed },
    });

    return {
      ok: true,
      rowsRemoved: removed,
      note: "Everything is gone and the app is back to its first run. Your account and password are untouched.",
    };
  },
});
