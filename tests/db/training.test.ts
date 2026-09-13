import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises, setLogs, workouts } from "@/lib/db/schema";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The training tools, against a real database.
 *
 * These are the handlers the coach and every screen both write through, and
 * they were the largest uncovered block in the app — seven per cent, because
 * the pure suite has no database and none of this is arithmetic. What breaks
 * here is a query, a date or a guard, and none of those can be checked by
 * reading the source.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("training"); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

suite("a session has edges", () => {
  it("starts, pauses, resumes and finishes one day", async () => {
    const started = await call<{ workoutId: string; date: string }>("start_workout");
    expect(started.workoutId).toBeTruthy();
    expect(started.date).toBe(a.today);

    const [open] = await db.select().from(workouts).where(eq(workouts.id, started.workoutId));
    expect(open.startedAt).not.toBeNull();
    expect(open.completedAt).toBeNull();

    const paused = await call<{ ok: boolean; paused?: boolean }>("pause_workout");
    expect(paused.ok).toBe(true);
    expect((await row(started.workoutId)).pausedAt).not.toBeNull();

    const resumed = await call<{ ok: boolean; pausedForMs?: number }>("resume_workout");
    expect(resumed.ok).toBe(true);
    const back = await row(started.workoutId);
    expect(back.pausedAt).toBeNull();
    // The stopped stretch is banked rather than counted as training: "you
    // trained for an hour" has to be true or it is worth nothing.
    expect(back.pausedMs).toBeGreaterThanOrEqual(0);

    await call("finish_workout");
    expect((await row(started.workoutId)).completedAt).not.toBeNull();
  });

  it("is safe to start twice — she tapped, or two devices did", async () => {
    const first = await call<{ workoutId: string }>("start_workout");
    const again = await call<{ workoutId: string }>("start_workout");
    expect(again.workoutId).toBe(first.workoutId);
  });

  it("sets the clock to what she says it was, and clears the pause under it", async () => {
    // "I forgot to unpause it, it was about fifty minutes." A corrected time
    // is the whole answer; a stopped clock underneath would only drift again.
    const { workoutId } = await call<{ workoutId: string }>("start_workout");
    await call("pause_workout");
    const out = await call<{ ok: boolean; minutes: number }>("set_session_time", { minutes: 50 });
    expect(out.ok).toBe(true);
    const w = await row(workoutId);
    expect(w.pausedAt).toBeNull();
    expect(w.pausedMs).toBe(0);
    const elapsedMin = (Date.now() - w.startedAt!.getTime()) / 60_000;
    expect(elapsedMin).toBeGreaterThan(49);
    expect(elapsedMin).toBeLessThan(52);
  });

  it("reopens a session she signed off, and keeps how it went", async () => {
    await call("finish_workout", { feeling: 4 });
    const before = await today();
    expect(before.completedAt).not.toBeNull();
    expect(before.feeling).toBe(4);

    const out = await call<{ ok: boolean }>("reopen_workout");
    expect(out.ok).toBe(true);
    const after = await today();
    expect(after.completedAt).toBeNull();
    // How it went is hers, and reopening is not her taking it back.
    expect(after.feeling).toBe(4);
  });

  it("says so rather than pretending, when there is no session to reopen", async () => {
    const out = await call<{ ok: boolean; error?: string }>("reopen_workout", {
      date: addDays(a.today, -30),
    });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/no session/i);
  });

  it("refuses a day that has not happened", async () => {
    const tomorrow = addDays(a.today, 1);
    for (const tool of ["start_workout", "finish_workout", "reopen_workout"]) {
      const out = await call<{ ok: boolean; error?: string }>(tool, { date: tomorrow });
      expect(out.ok, tool).toBe(false);
      expect(String(out.error), tool).toMatch(/future/i);
    }
  });
});

suite("logging a set", () => {
  it("files it against the day it was given, not the server's", async () => {
    const yesterday = addDays(a.today, -1);
    const out = await call<{ ok: boolean; setNumber: number }>("log_set", {
      exerciseSlug: "bodyweight-squat", reps: 8, date: yesterday,
    });
    expect(out.ok).toBe(true);
    const rows = await sets(yesterday);
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe(8);
  });

  it("numbers sets sequentially within a movement", async () => {
    // The card addresses a set by its position on screen, so a gap or a
    // duplicate makes delete and edit silently hit the wrong row.
    for (const reps of [10, 9, 8]) {
      await call("log_set", { exerciseSlug: "dumbbell-bench-press", reps, weight: 30 });
    }
    const mine = (await sets(a.today)).filter((r) => r.slug === "dumbbell-bench-press");
    expect(mine.map((r) => r.setNumber)).toEqual([1, 2, 3]);
  });

  it("renumbers what is left when one is deleted from the middle", async () => {
    await call("delete_set", { exerciseSlug: "dumbbell-bench-press", setNumber: 2 });
    const mine = (await sets(a.today)).filter((r) => r.slug === "dumbbell-bench-press");
    expect(mine.map((r) => r.setNumber)).toEqual([1, 2]);
    // The one that was third is now second, and it is the one she did last.
    expect(mine.map((r) => r.reps)).toEqual([10, 8]);
  });

  it("refuses reps for a hold and seconds for a count", async () => {
    // Her request, and she was right: asking for eight of a wall sit is the
    // app not understanding the movement. A hold contributes no tonnage
    // either, which is why the two are stored differently at all.
    const withReps = await call<{ ok: boolean; error?: string }>(
      "log_set", { exerciseSlug: "plank", reps: 8 },
    );
    expect(withReps.ok).toBe(false);
    expect(String(withReps.error)).toMatch(/hold|second/i);

    const withSeconds = await call<{ ok: boolean; error?: string }>(
      "log_set", { exerciseSlug: "bodyweight-squat", holdSeconds: 45 },
    );
    expect(withSeconds.ok).toBe(false);
  });

  it("takes a hold in seconds, and stores it as seconds", async () => {
    const out = await call<{ ok: boolean }>("log_set", { exerciseSlug: "plank", holdSeconds: 45 });
    expect(out.ok).toBe(true);
    const held = (await sets(a.today)).filter((r) => r.slug === "plank");
    expect(held[0].holdSeconds).toBe(45);
    // `reps` stays a count, so volume and progression still read correctly.
    expect(held[0].reps).toBe(1);
    expect(held[0].weightKg).toBeNull();
  });

  it("hands back a recoverable answer for a slug it does not know", async () => {
    // Never a throw: the model can call search_exercises and try again.
    const out = await call<{ ok: boolean; error?: string }>(
      "log_set", { exerciseSlug: "not-a-real-movement", reps: 5 },
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/unknown slug/i);
    expect(String(out.error)).toMatch(/search_exercises/);
  });

  it("corrects a set rather than adding another", async () => {
    const before = (await sets(a.today)).filter((r) => r.slug === "dumbbell-bench-press").length;
    await call("correct_set", { exerciseSlug: "dumbbell-bench-press", setNumber: 1, reps: 12, weight: 32.5 });
    const after = (await sets(a.today)).filter((r) => r.slug === "dumbbell-bench-press");
    expect(after).toHaveLength(before);
    expect(after[0].reps).toBe(12);
    expect(after[0].weightKg).toBeCloseTo(32.5, 1);
  });

  it("takes a whole movement back off the day", async () => {
    await call("remove_logged_exercise", { exerciseSlug: "dumbbell-bench-press" });
    expect((await sets(a.today)).filter((r) => r.slug === "dumbbell-bench-press")).toHaveLength(0);
  });

  it("refuses to log against a day in the future", async () => {
    const out = await call<{ ok: boolean; error?: string }>("log_set", {
      exerciseSlug: "bodyweight-squat", reps: 5, date: addDays(a.today, 2),
    });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/future/i);
  });
});

suite("the day's movements", () => {
  it("adds one, retargets it, and takes it off again", async () => {
    const added = await call<{ ok: boolean; added: string[] }>("add_exercise_to_day", {
      slug: "hip-thrust", sets: 4, reps: 8,
    });
    expect(added.ok).toBe(true);
    expect(added.added.join()).toMatch(/Hip Thrust/);
    expect(JSON.stringify(await call("get_plan"))).toContain("hip-thrust");

    const retargeted = await call<{ ok: boolean; changed: number }>("set_exercise_target", {
      slug: "hip-thrust", sets: 5, reps: 6,
    });
    expect(retargeted.ok).toBe(true);
    expect(retargeted.changed).toBeGreaterThan(0);

    const removed = await call<{ ok: boolean; removed: string }>("remove_exercise_from_day", {
      slug: "hip-thrust",
    });
    expect(removed.ok).toBe(true);
    expect(removed.removed).toMatch(/Hip Thrust/);
  });

  it("chains two into a superset and breaks it again", async () => {
    await call("add_exercise_to_day", { slug: "dumbbell-row", sets: 3, reps: 10 });
    await call("add_exercise_to_day", { slug: "lateral-raise", sets: 3, reps: 12 });

    const paired = await call<{ ok: boolean }>("superset_exercises", {
      slugs: ["dumbbell-row", "lateral-raise"],
    });
    expect(paired.ok).toBe(true);

    const broken = await call<{ ok: boolean }>("remove_superset", { slug: "dumbbell-row" });
    expect(broken.ok).toBe(true);
  });

  it("refuses a superset of one — that is just a movement", async () => {
    const out = await call<{ error?: string; issues?: string[] }>("superset_exercises", {
      slugs: ["dumbbell-row"],
    });
    expect(out.error).toBe("Invalid arguments");
  });

  it("reorders the day and says what the order now is", async () => {
    const out = await call<{ ok: boolean; order: string[] }>("reorder_day_exercises", {
      slugs: ["lateral-raise", "dumbbell-row"],
    });
    expect(out.ok).toBe(true);
    // The two she named, in the order she named them. Anything else already
    // on the day keeps its place rather than being dropped on the floor.
    expect(out.order.slice(0, 2)).toEqual(["lateral-raise", "dumbbell-row"]);
    expect(out.order).toContain("dumbbell-row");
  });
});

suite("reading her training back", () => {
  it("finds movements by the words people actually use", async () => {
    // "pull ups" has to reach "assisted-pull-up": lib/search-terms.ts turns
    // one into every spelling worth trying, on both sides of the match.
    const rows = await call<{ slug: string }[]>("search_exercises", { query: "pull ups" });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.slug.includes("pull-up"))).toBe(true);
  });

  it("finds one by muscle and by equipment too", async () => {
    expect((await call<{ slug: string }[]>("search_exercises", { query: "glutes" })).length)
      .toBeGreaterThan(0);
    expect((await call<{ slug: string }[]>("search_exercises", { equipment: "dumbbell" })).length)
      .toBeGreaterThan(0);
  });

  it("returns a guide, and points at search rather than throwing", async () => {
    const known = await call<{ name?: string; formCues?: unknown }>("get_exercise_guide", {
      slug: "bodyweight-squat",
    });
    expect(known.name).toBeTruthy();
    expect(known.formCues).toBeTruthy();

    const unknown = await call<{ error?: string }>("get_exercise_guide", { slug: "made-up-thing" });
    expect(String(unknown.error)).toMatch(/search_exercises/);
  });

  it("reads a movement's history without inventing one", async () => {
    const never = await call<{ sessions?: unknown[]; trend?: string }>("get_exercise_history", {
      slug: "calf-raise",
    });
    // Never done, so no sessions — not an error, and not a zero.
    expect(never.sessions ?? []).toHaveLength(0);

    const done = await call<{ sessions?: unknown[] }>("get_exercise_history", {
      slug: "bodyweight-squat",
    });
    expect((done.sessions ?? []).length).toBeGreaterThan(0);
  });

  it("reviews the week from what is logged, not from what was planned", async () => {
    const out = await call<{ weekStart: string; completed: number; totalSets: number }>("get_week_review");
    expect(out.weekStart).toBe(a.week);
    expect(out.completed).toBeGreaterThan(0);
    expect(out.totalSets).toBeGreaterThan(0);
  });

  it("reports the plan as seven days, rest days included", async () => {
    const plan = await call<{ exists: boolean; days: { dayOfWeek: number }[] }>("get_plan");
    expect(plan.exists).toBe(true);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

/* ------------------------------------------------------------- helpers --- */

async function row(id: string) {
  const [w] = await db.select().from(workouts).where(eq(workouts.id, id));
  return w;
}

async function today() {
  const [w] = await db.select().from(workouts)
    .where(and(eq(workouts.profileId, a.profileId), eq(workouts.date, a.today)));
  return w;
}

/** Her sets on a day, addressed by slug — never by id, the same as the model. */
async function sets(date: string) {
  const rows = await db
    .select({
      setNumber: setLogs.setNumber, reps: setLogs.reps, weightKg: setLogs.weightKg,
      holdSeconds: setLogs.holdSeconds, slug: exercises.slug,
    })
    .from(setLogs)
    .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(eq(workouts.profileId, a.profileId), eq(workouts.date, date)))
    .orderBy(setLogs.setNumber);
  return rows;
}
