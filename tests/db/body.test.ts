import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * Her body, her targets, and everything that refuses to answer.
 *
 * Half of these tests are about a tool declining. That is the point: a
 * fortnightly weigher told she gained half a kilo because she happened to
 * weigh in bloated is the exact failure this app is built not to have, and
 * the only way to check a refusal is to ask a real database a question it
 * does not have the rows to answer.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("body"); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

suite("weight is a trend, not a reading", () => {
  it("logs one and reports it against her start, never as progress", async () => {
    const out = await call<{
      logged: { date: string; weight: number; unit: string };
      changeSinceLast: number | null; changeSinceStart: number;
    }>("log_weight", { weight: 64.2 });
    expect(out.logged.date).toBe(a.today);
    expect(out.logged.unit).toBe("kg");
    // Nothing to compare against yet, and null rather than zero.
    expect(out.changeSinceLast).toBeNull();
    expect(out.changeSinceStart).toBeCloseTo(-0.8, 1);
  });

  it("refuses a weekly rate off one reading", async () => {
    // Five weigh-ins in the last fortnight and one in the last three days, or
    // it says nothing. `confidence` is what says which.
    const out = await call<{ weeklyChange: number | null; trendConfidence: string }>(
      "get_weight_history", {},
    );
    expect(out.weeklyChange).toBeNull();
    expect(out.trendConfidence).toBe("low");
  });

  it("answers once there are enough of them, and talks about the trend", async () => {
    for (let i = 1; i <= 8; i++) {
      await call("log_weight", { weight: 64.2 - i * 0.05, date: addDays(a.today, -i) });
    }
    const out = await call<{
      weeklyChange: number | null; trendConfidence: string; trend: number; latestReading: number;
    }>("get_weight_history", {});
    expect(out.weeklyChange).not.toBeNull();
    expect(out.trendConfidence).not.toBe("low");
    // The trend is the EWMA, and it is not the same number as this morning.
    expect(out.trend).not.toBe(out.latestReading);
  });

  it("takes one back without taking the rest", async () => {
    const before = await call<{ entries: unknown[] }>("get_weight_history", {});
    const out = await call<{ ok: boolean; note: string }>("remove_weigh_in", {});
    expect(out.ok).toBe(true);
    expect(out.note).toMatch(/recalculat/i);
    const after = await call<{ entries: unknown[] }>("get_weight_history", {});
    expect(after.entries.length).toBe(before.entries.length - 1);
  });

  it("refuses a weigh-in dated in the future", async () => {
    const out = await call<{ ok?: boolean; error?: string }>("log_weight", {
      weight: 64, date: addDays(a.today, 1),
    });
    expect(out.ok ?? false).toBe(false);
    expect(String(out.error)).toMatch(/future/i);
  });
});

suite("measurements", () => {
  it("records a site and says what changed, which is nothing the first time", async () => {
    const out = await call<{
      ok: boolean; unit: string; logged: { site: string; current: number; changeSinceLast: number | null }[];
    }>("log_measurement", { measurements: [{ site: "waist", value: 74 }] });
    expect(out.unit).toBe("cm");
    expect(out.logged[0].site).toBe("Waist");
    expect(out.logged[0].changeSinceLast).toBeNull();
  });

  it("keeps the history and reports the change once there is one", async () => {
    await call("log_measurement", {
      measurements: [{ site: "waist", value: 73 }], date: addDays(a.today, -7),
    });
    const out = await call<{ sites: { site: string; readings: number; history: unknown[] }[] }>(
      "get_measurements", {},
    );
    const waist = out.sites.find((s) => s.site === "Waist")!;
    expect(waist.readings).toBe(2);
    expect(waist.history).toHaveLength(2);
  });

  it("says what it still needs rather than estimating composition from nothing", async () => {
    const out = await call<{ ok: boolean; missing: string[]; error: string }>(
      "estimate_body_composition", {},
    );
    expect(out.ok).toBe(false);
    // Names the sites, and points at the guide for how to take them.
    expect(out.missing).toEqual(expect.arrayContaining(["hips", "neck"]));
    expect(out.error).toMatch(/get_measuring_guide/);
  });

  it("estimates once it has all three", async () => {
    await call("log_measurement", {
      measurements: [{ site: "hips", value: 96 }, { site: "neck", value: 32 }],
    });
    const out = await call<{ ok: boolean; bodyFatPercent?: number }>("estimate_body_composition", {});
    expect(out.ok).toBe(true);
  });
});

suite("what she burns is measured, not predicted", () => {
  it("refuses to move her target on a window that is not logged", async () => {
    // Rail one: under-logging can never lower her target. Under half the
    // window counted, or fewer than seven counted days, and it refuses.
    const out = await call<{ ok: boolean; canMeasure: boolean; why: string; hint: string }>(
      "run_check_in", {},
    );
    expect(out.canMeasure).toBe(false);
    expect(out.why).toMatch(/not enough|fully counted/i);
    // And it tells the coach not to act on it, in as many words.
    expect(out.hint).toMatch(/do not change/i);
  });

  it("never sets a target below what she burns at rest", async () => {
    // Rail two, enforced inside the tool so no prompt and no screen can talk
    // it lower. Sustained low energy availability costs bone density.
    const out = await call<{ ok?: boolean; error?: string; calorieTarget?: number }>(
      "set_nutrition_targets", { calorieTarget: 600, proteinTargetG: 110 },
    );
    if (out.ok === false) {
      expect(String(out.error)).toMatch(/below|floor|rest/i);
    } else {
      expect(out.calorieTarget).toBeGreaterThan(900);
    }
  });

  it("takes a sensible target and reports it back", async () => {
    const out = await call<{ ok?: boolean }>("set_nutrition_targets", {
      calorieTarget: 1800, proteinTargetG: 110,
    });
    expect(out.ok).not.toBe(false);
  });
});

suite("goals", () => {
  it("starts with none rather than one it invented", async () => {
    expect(await call<unknown[]>("list_goals", {})).toEqual([]);
  });

  it("sets one, lists it, and takes it off again", async () => {
    const set = await call<{ ok: boolean; goalId: string }>("set_goal", {
      kind: "weight", targetValue: 60, title: "to 60",
    });
    expect(set.ok).toBe(true);

    const listed = await call<{ id: string }[]>("list_goals", {});
    expect(listed.map((g) => g.id)).toContain(set.goalId);

    const removed = await call<{ ok: boolean }>("remove_goal", { goalId: set.goalId });
    expect(removed.ok).toBe(true);
    expect(await call<unknown[]>("list_goals", {})).toEqual([]);
  });

  it("refuses an id that is not one", async () => {
    const out = await call<{ ok?: boolean; error?: string }>("update_goal", {
      goalId: "the-weight-one", title: "x",
    });
    expect(out.ok ?? false).toBe(false);
  });
});

suite("sleep", () => {
  it("files a night under the morning she woke", async () => {
    const out = await call<{ ok: boolean; date: string; slept: string; state: string }>("log_sleep", {
      howLong: "7h30", quality: 4,
    });
    expect(out.date).toBe(a.today);
    expect(out.slept).toBe("7h 30m");
  });

  it("upserts rather than doubling the same night", async () => {
    await call("log_sleep", { howLong: "6h" });
    const out = await call<{ nights: unknown[]; loggedNights: number }>("get_sleep", {});
    expect(out.loggedNights).toBe(1);
  });

  it("refuses to average a fortnight with one night in it", async () => {
    const out = await call<{ average: string | null; confidence: string; note: string }>("get_sleep", {});
    expect(out.average).toBeNull();
    expect(out.confidence).toBe("under-logged");
    expect(out.note).toMatch(/do not average/i);
  });

  it("reads a length it cannot parse as nothing logged, not as zero", async () => {
    const out = await call<{ ok: boolean; error?: string }>("log_sleep", { howLong: "ages" });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/nothing was logged/i);
  });

  it("names the nights it does not have", async () => {
    const week = await call<{ missingNights: string[]; average: string | null }>("get_sleep_this_week", {});
    expect(week.missingNights.length).toBeGreaterThan(0);
    expect(week.average).toBeNull();
  });

  it("takes a night back", async () => {
    expect((await call<{ ok: boolean }>("remove_sleep", {})).ok).toBe(true);
    expect((await call<{ ok: boolean }>("remove_sleep", {})).ok).toBe(false);
  });
});

suite("her profile", () => {
  it("reads back in her own units, never in kilos she did not ask for", async () => {
    const out = await call<{ units: string; weightUnit: string; height: string }>("get_profile", {});
    expect(out.units).toBe("metric");
    expect(out.weightUnit).toBe("kg");
    expect(out.height).toMatch(/cm$/);
  });

  it("updates one field and says which", async () => {
    const out = await call<{ ok: boolean; updated: string[] }>("update_profile", { sessionMinutes: 50 });
    expect(out.updated).toEqual(["sessionMinutes"]);
  });

  it("switches theme and tone from the registry like everything else", async () => {
    expect((await call<{ ok: boolean; theme: string }>("set_theme", { theme: "dusk" })).theme).toBe("dusk");
    const themes = await call<{ current: { id: string }; themes: unknown[] }>("list_themes", {});
    expect(themes.current.id).toBe("dusk");
    expect(themes.themes.length).toBeGreaterThan(1);
  });
});

suite("what a session cost", () => {
  it("is an estimate, and says so on the way out", async () => {
    const out = await call<{ totalKcal: number; estimate: string }>("get_calories_burned", {});
    expect(out.estimate).toMatch(/estimate/i);
    // And the caveat that matters: it is never added to what she can eat.
    expect(out.estimate).toMatch(/not added/i);
  });
});

suite("coming back from childbirth", () => {
  it("does not assume it", async () => {
    const out = await call<{ postpartum: boolean; note: string }>("get_postpartum_plan", {});
    expect(out.postpartum).toBe(false);
    expect(out.note).toMatch(/do not assume/i);
  });

  it("keeps her in the early stage until somebody clears her", async () => {
    // Time does not promote her; the check does, because the check is what
    // rules out what an app cannot see.
    const out = await call<{ ok: boolean; stage: string; wasCleared: boolean }>(
      "set_postpartum_status", { birthDate: addDays(a.today, -200) },
    );
    expect(out.wasCleared).toBe(false);
    expect(out.stage).toBe("early");
  });
});

suite("her cycle", () => {
  it("stays quiet until she raises it", async () => {
    const out = await call<{ tracking: boolean; hint: string }>("get_cycle_status", {});
    expect(out.tracking).toBe(false);
    expect(out.hint).toMatch(/do not raise it unless she does/i);
  });

  it("starts counting once she logs one", async () => {
    const out = await call<{ ok: boolean; dayOfCycle: number }>("log_cycle_event", { kind: "period_start" });
    expect(out.dayOfCycle).toBe(1);
    expect((await call<{ tracking: boolean }>("get_cycle_status", {})).tracking).toBe(true);
  });
});
