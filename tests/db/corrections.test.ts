import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, mealLogs, profiles, weighIns, workouts } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The undo half, and the audit trail behind it.
 *
 * Almost every table here could be written to and not corrected, so the
 * coach's honest answer to "delete that, it was a mistake" was no — and a
 * coach that refuses a reasonable request about her own data is one she stops
 * asking. Three rules for anything that destroys: scope it to her profile in
 * the query itself, call `audit()`, and lead the description with what it
 * *does*.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("corrections"); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

suite("taking a day back", () => {
  it("deletes one workout and the sets under it", async () => {
    await call("log_set", { exerciseSlug: "bodyweight-squat", reps: 10 });
    const before = await db.select().from(workouts)
      .where(and(eq(workouts.profileId, a.profileId), eq(workouts.date, a.today)));
    expect(before).toHaveLength(1);

    const out = await call<{ ok: boolean }>("delete_workout", { date: a.today });
    expect(out.ok).toBe(true);
    const after = await db.select().from(workouts)
      .where(and(eq(workouts.profileId, a.profileId), eq(workouts.date, a.today)));
    expect(after).toHaveLength(0);
  });

  it("clears a whole range and says exactly what went", async () => {
    const when = addDays(a.today, -2);
    await call("log_set", { exerciseSlug: "bodyweight-squat", reps: 8, date: when });
    await call("log_meal", { slot: "lunch", description: "x", calories: 300, date: when });
    await call("log_weight", { weight: 64, date: when });
    await call("log_sleep", { howLong: "7h", date: when });

    const out = await call<{ ok: boolean; removed: Record<string, number> }>("clear_range", {
      fromDate: addDays(a.today, -3), toDate: addDays(a.today, -1),
    });
    expect(out.ok).toBe(true);
    // A count per table, so "delete last week" is never a silent no-op.
    expect(out.removed.workouts).toBeGreaterThan(0);
    expect(out.removed.meals).toBeGreaterThan(0);
    expect(out.removed.weighIns).toBeGreaterThan(0);
    expect(out.removed.sleep).toBeGreaterThan(0);

    expect(await db.select().from(mealLogs)
      .where(and(eq(mealLogs.profileId, a.profileId), eq(mealLogs.date, when)))).toHaveLength(0);
    expect(await db.select().from(weighIns)
      .where(and(eq(weighIns.profileId, a.profileId), eq(weighIns.date, when)))).toHaveLength(0);
  });

  it("takes the phrase, and nothing less, before it erases everything", async () => {
    // "Delete my account" is the one sentence a prompt must never say on her
    // behalf. `erase_all_my_data` keeps the account and empties it, and it
    // still wants the words typed out.
    const vague = await call<{ error?: string }>("erase_all_my_data", { confirm: "yes" });
    expect(vague.error).toBe("Invalid arguments");
  });
});

suite("the audit log", () => {
  it("records a destructive call, and never the data it destroyed", async () => {
    const before = (await db.select().from(auditLog)).length;
    await call("log_meal", { slot: "snack", description: "audit-probe-marker", calories: 100 });
    await call("clear_meal_logs", {});

    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(30);
    expect((await db.select().from(auditLog)).length).toBeGreaterThan(before);

    /*
      And the log is a record of *what happened*, never of what it held.

      "Never log a credential, a passphrase attempt — even hashed, since that
      is a wordlist — or her body data." The description of the meal that was
      just deleted is her data, and it must not have been copied into the
      thing that recorded the deletion.
    */
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/audit-probe-marker/);
    expect(text).not.toMatch(/password|passphrase|hash/i);
  });
});

suite("the conversation is hers too", () => {
  it("forgets it without touching anything else", async () => {
    await call("log_weight", { weight: 64.5 });
    const out = await call<{ ok: boolean; note: string }>("forget_conversation", {});
    expect(out.ok).toBe(true);
    expect(out.note).toMatch(/untouched/i);
    // The weigh-in is still there: this was the conversation only.
    expect(await db.select().from(weighIns).where(eq(weighIns.profileId, a.profileId)))
      .not.toHaveLength(0);
  });

  it("exports what was said, and says plainly when nothing was", async () => {
    const out = await call<{ ok: boolean; messages: number; text: string; filename: string }>(
      "export_transcript", {},
    );
    expect(out.ok).toBe(true);
    expect(out.messages).toBe(0);
    expect(out.text).toMatch(/nothing said/i);
    expect(out.filename).toMatch(/\.txt$/);
  });

  it("refuses to rewind to a message id that is not one", async () => {
    const out = await call<{ ok?: boolean; error?: string }>("rewind_conversation", {
      messageId: "the-one-about-squats",
    });
    expect(out.ok ?? false).toBe(false);
  });
});

suite("photos", () => {
  it("has none, and says what they are for rather than nothing", async () => {
    // An empty state is not `return null`: a card that disappears is
    // indistinguishable from one that is broken.
    const out = await call<{ photos: unknown[]; hint: string }>("list_progress_photos", {});
    expect(out.photos).toHaveLength(0);
    expect(out.hint).toMatch(/scale misses|recomposition/i);
  });

  it("will not delete in bulk without being told which", async () => {
    const out = await call<{ ok: boolean; error: string }>("delete_progress_photos", {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/say which/i);
  });
});

suite("what she may spend", () => {
  it("reports usage against the cap, in percentages", async () => {
    const out = await call<{ usedPercent: number; remainingPercent: number; capPercent: number }>(
      "get_coach_usage", {},
    );
    expect(out.usedPercent + out.remainingPercent).toBe(100);
  });

  it("only ever tightens — there is no number that means more", async () => {
    /*
      `set_coach_budget` takes a percentage rather than an amount precisely so
      a session cannot ask for a bigger one: 100 *is* the deployment's
      ceiling, so 500 clamps to the ceiling rather than raising it. The
      structural property, not the error message, is what is checked here.
    */
    const half = await call<{ ok: boolean }>("set_coach_budget", { percentOfMax: 50 });
    expect(half.ok).toBe(true);
    const [tightened] = await db.select({ micros: profiles.dailyBudgetMicros })
      .from(profiles).where(eq(profiles.id, a.profileId));
    expect(tightened.micros).toBeLessThan(LIMITS.dailyCostMicros);

    await call("set_coach_budget", { percentOfMax: 500 });
    const [clamped] = await db.select({ micros: profiles.dailyBudgetMicros })
      .from(profiles).where(eq(profiles.id, a.profileId));
    expect(clamped.micros).toBeLessThanOrEqual(LIMITS.dailyCostMicros);

    // And null hands the full allowance back, which is the only way up.
    await call("set_coach_budget", { percentOfMax: null });
    const [restored] = await db.select({ micros: profiles.dailyBudgetMicros })
      .from(profiles).where(eq(profiles.id, a.profileId));
    expect(restored.micros).toBeNull();
  });

  it("lets her ask for a top-up, and never grant one", async () => {
    const out = await call<{ ok: boolean; message: string }>("request_top_up", {});
    expect(out.ok).toBe(true);
    // The owner answers. A prompt that could grant is a prompt that could buy
    // itself an unlimited day.
    expect(out.message).toMatch(/owner/i);
  });
});

suite("complaints and feedback", () => {
  it("records something that hurts and lists it back open", async () => {
    const logged = await call<{ ok: boolean }>("log_complaint", { region: "knee", note: "aches on stairs" });
    expect(logged.ok).toBe(true);
    const open = await call<{ open: { region?: string }[] }>("list_complaints", {});
    expect(open.open.length).toBeGreaterThan(0);
  });

  it("takes a request and gives it back to the person who filed it", async () => {
    const sent = await call<{ ok: boolean; id: string }>("submit_feedback", {
      kind: "idea", body: "a test request", path: "/",
    });
    expect(sent.ok).toBe(true);
    // Hers alone, by construction — the query is scoped to her profile, so
    // this can never be somebody else's list.
    const mine = await call<{ request: string; status: string }[]>("list_feedback", {});
    expect(mine.map((f) => f.request)).toContain("a test request");
    expect(mine[0].status).toBeTruthy();
  });
});
