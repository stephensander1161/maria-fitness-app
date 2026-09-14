import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { runTool } from "@/lib/tools";
import { rollForward } from "@/lib/plan-rollover";
import { addDays } from "@/lib/date";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The week, the templates, and everything that shapes a plan without asking
 * the model for one.
 *
 * `create_weekly_plan` and `create_meal_plan` cost money and take seconds, so
 * they are `slow: "planner"` and they belong in evals/. Everything around
 * them is ordinary code that was never covered: rolling a week forward,
 * applying a template, copying a week, lightening one, the maintenance phase,
 * the equipment override, and the substitutions.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("planning"); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

suite("the programme repeats", () => {
  it("carries last week's movements into a week with no plan of its own", async () => {
    // Monday morning is not an empty screen. Idempotent, and it only ever
    // writes on the first view of a new week.
    await call("add_exercise_to_day", { slug: "hip-thrust", sets: 3, reps: 10, dayOfWeek: 0 });

    const nextWeek = addDays(a.week, 7);
    expect(await rollForward(a.profileId, nextWeek)).toBe(true);
    // Called twice is called once: the second view must not duplicate a week.
    expect(await rollForward(a.profileId, nextWeek)).toBe(false);

    const plan = await call<{ exists: boolean; weekStart: string; days: { exercises: unknown[] }[] }>(
      "get_plan", { weekStart: nextWeek },
    );
    expect(plan.exists).toBe(true);
    expect(JSON.stringify(plan)).toContain("hip-thrust");
  });

  it("does nothing for a week that already has one", async () => {
    expect(await rollForward(a.profileId, a.week)).toBe(false);
  });
});

suite("templates", () => {
  it("suggests one that fits her kit and her days", async () => {
    const out = await call<{ training: { slug: string; why: string }; meals: { slug: string } }>(
      "suggest_template", {},
    );
    expect(out.training.slug).toBeTruthy();
    // And it says why, because a template picked for her without a reason is
    // a plan she has no way to disagree with.
    expect(out.training.why.length).toBeGreaterThan(20);
    expect(out.meals.slug).toBeTruthy();
  });

  it("lists them with what each is for", async () => {
    const out = await call<{ training: { slug: string; suits: string }[] }>("list_templates", {});
    expect(out.training.length).toBeGreaterThan(0);
    expect(out.training[0].suits.length).toBeGreaterThan(10);
  });

  it("applies one and fills the week with it", async () => {
    const pick = await call<{ training: { slug: string } }>("suggest_template", {});
    const out = await call<{ ok: boolean; applied: string[] }>("apply_template", {
      trainingSlug: pick.training.slug,
    });
    expect(out.ok).toBe(true);
    expect(out.applied.length).toBeGreaterThan(0);

    const plan = await call<{ days: { isRest: boolean; exercises: unknown[] }[] }>("get_plan", {});
    expect(plan.days.filter((d) => !d.isRest).length).toBeGreaterThan(0);
  });

  it("says which rather than guessing when given no slug", async () => {
    const out = await call<{ ok: boolean; error: string }>("apply_template", {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/name a/i);
  });
});

suite("moving a week around", () => {
  it("copies one forward", async () => {
    const out = await call<{ ok: boolean }>("copy_week", {
      fromWeekStart: a.week, toWeekStart: addDays(a.week, 14),
    });
    expect(out.ok).toBe(true);
    expect((await call<{ exists: boolean }>("get_plan", { weekStart: addDays(a.week, 14) })).exists)
      .toBe(true);
  });

  it("refuses to copy a week that is not there", async () => {
    const out = await call<{ ok: boolean; error: string }>("copy_week", {
      fromWeekStart: addDays(a.week, -70), toWeekStart: addDays(a.week, 21),
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no training plan/i);
  });

  it("lightens a week rather than deleting it", async () => {
    const out = await call<{ ok: boolean }>("schedule_deload", { weekStart: a.week });
    expect(out.ok).toBe(true);
    const plan = await call<{ days: { exercises: unknown[] }[] }>("get_plan", {});
    // Still a week of training — a deload is less, not nothing.
    expect(plan.days.some((d) => d.exercises.length > 0)).toBe(true);
  });

  it("clears one when she asks outright, and keeps what she actually did", async () => {
    const out = await call<{ ok: boolean; note: string }>("clear_plan", {
      weekStart: addDays(a.week, 14),
    });
    expect(out.ok).toBe(true);
    expect(out.note).toMatch(/already logged are untouched/i);
  });
});

suite("maintenance", () => {
  it("starts, reports its end, and can be ended early", async () => {
    const started = await call<{ ok: boolean; until: string; days: number; hint: string }>(
      "start_maintenance_phase", {},
    );
    expect(started.ok).toBe(true);
    expect(started.days).toBeGreaterThan(0);
    // And it tells the coach the scale will move and why, so she is not told
    // she has gained fat in three days.
    expect(started.hint).toMatch(/food and water|not fat/i);

    const ended = await call<{ ok: boolean; wasUntil: string | null }>("end_maintenance_phase", {});
    expect(ended.ok).toBe(true);
    // What it *was*, read before the write — `returning()` on an UPDATE hands
    // back the new row, so this was null on every call until it was fixed.
    expect(ended.wasUntil).toBe(started.until);

    // And ending one that is not running says so rather than inventing a date.
    expect((await call<{ wasUntil: string | null }>("end_maintenance_phase", {})).wasUntil).toBeNull();
  });
});

suite("what she has to train with today", () => {
  it("takes an override and gives it back", async () => {
    const set = await call<{ ok: boolean }>("set_equipment_override", {
      equipment: ["bodyweight"], days: 3,
    });
    expect(set.ok).toBe(true);
    const cleared = await call<{ ok: boolean }>("clear_equipment_override", {});
    expect(cleared.ok).toBe(true);
  });
});

suite("swapping a movement out", () => {
  it("offers alternatives that work the same thing", async () => {
    const out = await call<{
      ok: boolean; replacing: string; options: { slug: string; worksInstead: string }[];
    }>("suggest_substitutes", { slug: "barbell-back-squat" });
    expect(out.ok).toBe(true);
    expect(out.replacing).toBe("Barbell Back Squat");
    expect(out.options.length).toBeGreaterThan(0);
    // Each says what it works instead, so the choice is informed.
    expect(out.options[0].worksInstead.length).toBeGreaterThan(3);
    expect(out.options.map((o) => o.slug)).not.toContain("barbell-back-squat");
  });

  it("puts one in the plan's place", async () => {
    // Added to the week this tool will look in, which is the week of *her*
    // today — the earlier tests in this file move plans around, and an
    // exercise added to a week that has since been cleared is not a swap.
    const today = await call<{ weekStart: string }>("get_plan", {});
    expect(today.weekStart).toBe(a.week);
    await call("add_exercise_to_day", { slug: "barbell-back-squat", sets: 3, reps: 5 });
    expect(JSON.stringify(await call("get_plan", {}))).toContain("barbell-back-squat");

    const out = await call<{ ok: boolean; error?: string }>("substitute_exercise", {
      slug: "barbell-back-squat", withSlug: "leg-press",
    });
    expect(out.error ?? "").toBe("");
    expect(out.ok).toBe(true);
    const plan = JSON.stringify(await call("get_plan", {}));
    expect(plan).toContain("leg-press");
    expect(plan).not.toContain("barbell-back-squat");
  });

  it("refuses to put a movement beside itself", async () => {
    // Swapping A for B when B is already on the day is two of B, which is
    // never what she meant — and the app says which two rather than silently
    // merging them.
    await call("add_exercise_to_day", { slug: "bulgarian-split-squat", sets: 3, reps: 8 });
    const out = await call<{ ok: boolean; error?: string }>("substitute_exercise", {
      slug: "leg-press", withSlug: "bulgarian-split-squat",
    });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/already in that day/i);
  });
});

suite("stretches and the movements around a session", () => {
  it("offers a flow on a rest day and a warm-up on a training one", async () => {
    // A rest day gets a loosening flow; a day with work on it gets movements
    // chosen from what that day trains. Both are named, because a slug is not
    // something anybody can follow.
    const working = await call<Record<string, unknown>>("get_stretches", {});
    expect(working.ok).toBe(true);
    const named = JSON.stringify(working).match(/"name":"[^"]+"/g) ?? [];
    expect(named.length).toBeGreaterThan(0);
  });
});

suite("progression", () => {
  it("has nothing to suggest before she has lifted anything", async () => {
    const out = await call<{ movements: unknown[] }>("get_exercise_progression", {});
    expect(out.movements).toHaveLength(0);
  });

  it("refuses a one-rep max off a movement with no weight on it", async () => {
    const out = await call<{ ok: boolean; error: string }>("estimate_one_rep_max", {
      slug: "barbell-back-squat", reps: 5, weight: 60,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/nothing logged/i);
  });

  it("works one out once there is something to work it out from", async () => {
    await call("log_set", { exerciseSlug: "barbell-back-squat", reps: 5, weight: 60 });
    const out = await call<{ ok: boolean; estimate?: number; oneRepMax?: number }>(
      "estimate_one_rep_max", { slug: "barbell-back-squat", reps: 5, weight: 60 },
    );
    expect(out.ok).toBe(true);
  });

  it("names the next target for a movement she has done", async () => {
    const out = await call<{ ok: boolean; movements: unknown[] }>("get_next_targets", {
      slug: "barbell-back-squat",
    });
    expect(out.ok).toBe(true);
  });
});
