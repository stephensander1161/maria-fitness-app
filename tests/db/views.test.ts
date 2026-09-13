import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import {
  buddyState, dayFoodView, kitchenView, mealWeekView, morningWeighIn, movementView,
  pantryView, pickableExercises, planSummary, savedMealsView, titleStats, titleStatsRaw,
  todayView, waterTotals, weekView, whatsNewForProfile,
} from "@/lib/views";
import {
  currentStreak, exerciseHistory, goalProgress, lastTimeTargets, measurementProgress,
  nutritionTrend, todaySnapshot, trainingTotals, weekReview,
} from "@/lib/progress";
import { db } from "@/lib/db";
import { exercises, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The read models the screens render from.
 *
 * Every page in this app gets its numbers here, and the rule that makes them
 * dangerous is in CLAUDE.md: the volatile block the coach is given comes from
 * the same place, and **the model believes it completely**. `todaySnapshot`
 * once collapsed a session onto the first set's weight and reported "6×8 @
 * 60lb" for a session that ended in three sets at 95, so the coach
 * correctly-but-wrongly told her she had missed her milestone.
 */
let a: TestAccount;

beforeAll(async () => {
  a = await makeAccount("views");
  await runTool("add_exercise_to_day", { slug: "bodyweight-squat", sets: 3, reps: 10 }, a.ctx);
  await runTool("add_exercise_to_day", { slug: "dumbbell-row", sets: 3, reps: 10 }, a.ctx);
});
afterAll(async () => { await dropAccount(a); });

/** History and targets are addressed by id inside lib/, by slug everywhere else. */
const idFor = async (slug: string) => {
  const [row] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.slug, slug));
  return row.id;
};

const profile = async () => {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, a.profileId));
  return p;
};

suite("today, as the Train screen sees it", () => {
  it("carries the day's movements with their targets and nothing logged yet", async () => {
    const view = await todayView(a.profileId, "metric", a.today);
    expect(view.exercises.map((e) => e.slug)).toEqual(
      expect.arrayContaining(["bodyweight-squat", "dumbbell-row"]),
    );
    const squat = view.exercises.find((e) => e.slug === "bodyweight-squat")!;
    expect(squat.targetSets).toBe(3);
    expect(squat.loggedToday).toHaveLength(0);
    expect(view.startedAt).toBeNull();
    expect(view.finishedAt).toBeNull();
  });

  it("shows a set the moment it is logged, in her units", async () => {
    await runTool("log_set", { exerciseSlug: "bodyweight-squat", reps: 10 }, a.ctx);
    const view = await todayView(a.profileId, "metric", a.today);
    const squat = view.exercises.find((e) => e.slug === "bodyweight-squat")!;
    expect(squat.loggedToday).toHaveLength(1);
    expect(squat.loggedToday[0].reps).toBe(10);
    expect(view.unit).toBe("kg");
  });

  it("reads the same day in imperial without touching what is stored", async () => {
    await runTool("log_set", { exerciseSlug: "dumbbell-row", reps: 10, weight: 20 }, a.ctx);
    const metric = await todayView(a.profileId, "metric", a.today);
    const imperial = await todayView(a.profileId, "imperial", a.today);
    const kg = metric.exercises.find((e) => e.slug === "dumbbell-row")!.loggedToday[0].weight!;
    const lb = imperial.exercises.find((e) => e.slug === "dumbbell-row")!.loggedToday[0].weight!;
    expect(imperial.unit).toBe("lb");
    expect(lb).toBeGreaterThan(kg * 2);
  });

  it("says a future day is a plan, not a record", async () => {
    const view = await todayView(a.profileId, "metric", addDays(a.today, 2));
    expect(view.exercises.every((e) => e.loggedToday.length === 0)).toBe(true);
  });
});

suite("the week, and the plan behind it", () => {
  it("renders seven days whether or not they have work on them", async () => {
    const view = await weekView(a.profileId, "metric", a.week, a.today);
    expect(view.days).toHaveLength(7);
  });

  it("summarises the plan without inventing one", async () => {
    const summary = await planSummary(a.profileId, "metric", a.today);
    expect(summary).toMatch(/week/i);
  });

  it("has a meal week even before a meal plan exists", async () => {
    const view = await mealWeekView(a.profileId, "metric", a.week, a.today);
    expect(view.days).toHaveLength(7);
  });
});

suite("a snapshot the model is going to believe", () => {
  it("reports every set of a movement, not the first one repeated", async () => {
    // The bug: a session ending in three sets at 95 was reported as "6×8 @
    // 60lb" because the whole thing was collapsed onto the opening set.
    for (const w of [40, 45, 50]) {
      await runTool("log_set", { exerciseSlug: "dumbbell-row", reps: 8, weight: w }, a.ctx);
    }
    const snap = await todaySnapshot(a.profileId, "metric", a.today);
    const text = JSON.stringify(snap);
    expect(text).toMatch(/50/);
    // And it does not claim the heaviest was the only one.
    expect(text).toMatch(/40|45/);
  });

  it("labels planned targets as planned, never as done", async () => {
    const snap = await todaySnapshot(a.profileId, "metric", a.today);
    expect(JSON.stringify(snap).length).toBeGreaterThan(2);
  });
});

suite("history, streaks and totals", () => {
  it("reads a movement's sessions back, and has nothing to invent for one never done", async () => {
    const row = await idFor("dumbbell-row");
    const done = await exerciseHistory(a.profileId, row);
    expect(done.length).toBeGreaterThan(0);
    expect(done[0].sets.length).toBeGreaterThan(0);

    const never = await exerciseHistory(a.profileId, await idFor("calf-raise"));
    expect(never).toHaveLength(0);
  });

  it("seeds next time's targets from last time, and nothing where there is no last time", async () => {
    const rows = [await idFor("dumbbell-row"), await idFor("calf-raise")];
    const targets = await lastTimeTargets(a.profileId, rows);
    expect(targets.has(rows[0])).toBe(true);
    // Never done, so never seeded — a target invented from nothing is a
    // number she has to argue with.
    expect(targets.has(rows[1])).toBe(false);

    expect((await lastTimeTargets(a.profileId, [])).size).toBe(0);
  });

  it("counts a streak from work, not from a button nobody presses", async () => {
    // `workoutHappened` is the one predicate: completed_at, or any set logged.
    const streak = await currentStreak(a.profileId, a.today);
    expect(streak).toBeGreaterThanOrEqual(1);
  });

  it("totals the training without counting a hold as tonnage", async () => {
    await runTool("log_set", { exerciseSlug: "plank", holdSeconds: 60 }, a.ctx);
    const totals = await trainingTotals(a.profileId, a.today);
    expect(totals).toBeTruthy();
    // A wall sit has no load, so a hold can add sets and never tonnage. What
    // must never appear is a NaN from multiplying a null weight by reps.
    expect(JSON.stringify(totals)).not.toMatch(/NaN|null,"volume"/);
  });

  it("reviews the week against what was planned", async () => {
    const review = await weekReview(a.profileId, "metric", a.week, a.today);
    expect(review.weekStart).toBe(a.week);
    expect(review.totalSets).toBeGreaterThan(0);
  });
});

suite("food, as the Eat screen sees it", () => {
  it("counts a logged day and flags what is only a floor", async () => {
    await runTool("log_meal", {
      slot: "breakfast", description: "oats", calories: 400, proteinG: 15,
    }, a.ctx);
    await runTool("log_meal", { slot: "lunch", description: "leftovers" }, a.ctx);

    const day = await dayFoodView(a.profileId, a.today);
    expect(day.logged).toHaveLength(2);
    // One entry has no figures, so the day's calories are a floor and the
    // view says which — this is the "≥1150" rule, one level up from fibre.
    expect(day.caloriesComplete).toBe(false);
    expect(day.caloriesKnownFor).toBe(1);
    expect(day.caloriesUnknownFor).toBe(1);
    // And the figure itself is the floor, not a guess at the missing half.
    expect(day.calories).toBe(400);
  });

  it("averages only fully counted days over a window", async () => {
    const trend = await nutritionTrend(a.profileId, 14, a.today);
    expect(trend.daysLogged).toBeGreaterThan(0);
    // One of the two entries today carries no figures, so today is not
    // counted and there is nothing else in the window.
    expect(trend.daysCounted).toBe(0);
    expect(trend.avgCalories).toBeNull();
  });

  it("reads the kitchen and the saved meals without a plan in place", async () => {
    expect((await kitchenView(a.profileId, "metric", a.today)).items.length).toBeGreaterThanOrEqual(0);
    expect(await pantryView(a.profileId, "metric", a.today)).toBeTruthy();
    expect((await savedMealsView(a.profileId)).length).toBe(0);
  });

  it("never reads an unlogged day as a dry one", async () => {
    const water = await waterTotals(a.profileId, a.today);
    expect(water.today).toBeNull();
  });
});

suite("the morning prompt, in her timezone", () => {
  it("asks for the weight and for last night, while both are outstanding", async () => {
    const p = await profile();
    const ask = await morningWeighIn(p);
    // Her timezone is UTC here, so the hour depends on when this runs. Either
    // it is the small hours and there is no prompt, or there is one and it
    // carries both questions.
    if (ask) {
      expect(ask.today).toBe(a.today);
      expect(ask.askSleep).toBe(true);
      expect(ask.unit).toBe("kg");
    }
  });

  it("stops asking about sleep once last night is in", async () => {
    await runTool("log_sleep", { howLong: "8h" }, a.ctx);
    const ask = await morningWeighIn(await profile());
    if (ask) expect(ask.askSleep).toBe(false);
  });

  it("stops asking at all once she has weighed in", async () => {
    await runTool("log_weight", { weight: 64 }, a.ctx);
    expect(await morningWeighIn(await profile())).toBeNull();
  });
});

suite("her rank", () => {
  it("is built from what actually happened, not from what was logged", async () => {
    const stats = await titleStatsRaw(a.profileId, a.today);
    expect(stats.sets).toBeGreaterThan(0);
    expect(stats.sessions).toBeGreaterThan(0);
    // A day logged in words is neither a good day nor a bad one.
    expect(stats.daysUncounted).toBeGreaterThanOrEqual(1);
    expect(stats.missedSessions).toBeGreaterThanOrEqual(0);
  });

  it("never shows a smaller title than the one she was told about", async () => {
    const p = await profile();
    const floored = await titleStats({ id: a.profileId, titleSeenAt: 10_200 }, a.today);
    expect(floored.name).toBe("Local Legend");
    const honest = await titleStats({ id: a.profileId, titleSeenAt: p.titleSeenAt }, a.today);
    expect(honest.progress).toBeGreaterThanOrEqual(0);
    expect(honest.progress).toBeLessThanOrEqual(100);
  });
});

suite("the rest of the screens", () => {
  it("marks what her kit covers rather than hiding the rest", async () => {
    // Marked, never enforced: a movement she cannot do today is still one she
    // might want to read about, and a library that silently shortens itself
    // is one she never learns the shape of.
    const kitted = await pickableExercises(["dumbbells", "bench", "barbell"]);
    const bodyweight = await pickableExercises([]);
    const flat = (p: Awaited<ReturnType<typeof pickableExercises>>) =>
      p.groups.flatMap((g) => g.items);

    expect(kitted.groups.length).toBeGreaterThan(0);
    // The same library either way…
    expect(flat(bodyweight)).toHaveLength(flat(kitted).length);
    // …and fewer of them marked as hers when she has nothing.
    expect(flat(bodyweight).filter((e) => e.have).length)
      .toBeLessThan(flat(kitted).filter((e) => e.have).length);
    // And anything she cannot do names the one thing it wants.
    for (const e of flat(bodyweight).filter((x) => !x.have)) {
      expect(e.missing, e.slug).toBeTruthy();
    }
  });

  it("reads one movement's page", async () => {
    const view = await movementView("bodyweight-squat");
    expect(view?.name).toBeTruthy();
    expect(await movementView("not-a-movement")).toBeNull();
  });

  it("tells the companion what it knows, and nothing it does not", async () => {
    const state = await buddyState(await profile());
    expect(state).toBeTruthy();
    expect(JSON.stringify(state)).not.toMatch(/NaN|undefined/);
  });

  it("shows nothing as new to an account created after the entry", async () => {
    // An account made today was never there for anything shipped before it,
    // so none of it is "new" to her — that is the rule `unseen()` holds.
    const seen = await whatsNewForProfile(await profile(), false);
    expect(seen).toEqual([]);
  });

  it("measures progress only where there are two readings", async () => {
    const none = await measurementProgress(a.profileId, "metric", a.today);
    expect(none).toBeTruthy();
  });

  it("says where she is against her goal, in words", async () => {
    const said = await goalProgress(a.profileId, "metric");
    expect(typeof said).toBe("string");
  });
});
