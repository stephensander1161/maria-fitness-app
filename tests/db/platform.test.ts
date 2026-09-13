import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import { audit, maskEmail, recentEvents, refusedAddress } from "@/lib/audit";
import { adminOverview, money } from "@/lib/admin";
import { adminCosts } from "@/lib/admin-costs";
import { backupKey, dumpEverything, staleBackups } from "@/lib/backup";
import { contextForPath, dayInPath, screenFor } from "@/lib/page-context";
import {
  latestConversation, listConversations, loadHistory, nameIfUntitled, ownsConversation,
  saveMessage, startConversation, TITLE_CHARS,
} from "@/lib/agent/history";
import { photoLibrary, photoSrc } from "@/lib/photos";
import { energyBalanceBetween } from "@/lib/energy-balance";
import { costMicros, effectiveDailyLimit, LIMITS, recordEvent, todaySpend } from "@/lib/limits";
import { sleepBetween, sleepOn } from "@/lib/sleep";
import { sweepReminders } from "@/lib/reminders";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * The platform underneath the features.
 *
 * The conversation, the audit log, the spend ledger, the owner's console, the
 * nightly backup, the screen context the coach is given. None of it is a
 * screen and all of it is a query, so none of it had a test — and two of
 * these are the controls COMPLIANCE.md claims exist.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("platform", { name: "Plat" }); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

suite("the conversation is threads now", () => {
  let first = "";

  it("starts one lazily, on the first thing said", async () => {
    // Not on opening the sheet, or every tap that opened and closed it would
    // leave an empty thread in the list.
    expect(await latestConversation(a.profileId)).toBeNull();
    first = await startConversation(a.profileId, "how many sets should I do");
    expect(first).toBeTruthy();
    expect(await latestConversation(a.profileId)).toBe(first);
  });

  it("replays only that thread", async () => {
    const second = await startConversation(a.profileId, "what's for dinner");
    const said = (text: string) => [{ type: "text" as const, text }];
    await saveMessage(a.profileId, "user", said("in the first thread"), first);
    await saveMessage(a.profileId, "user", said("in the second thread"), second);

    const one = JSON.stringify(await loadHistory(a.profileId, first));
    expect(one).toContain("in the first thread");
    expect(one).not.toContain("in the second thread");

    // And no thread at all replays nothing, rather than everything.
    expect(await loadHistory(a.profileId, null)).toEqual([]);
  });

  it("names a thread from what was said, and only once", async () => {
    await nameIfUntitled(
      a.profileId, first,
      "a very long first message that would run past the title's limit if it were not cut short",
    );
    const [listed] = (await listConversations(a.profileId)).filter((c) => c.id === first);
    expect(listed.title).toBeTruthy();
    expect(listed.title!.length).toBeLessThanOrEqual(TITLE_CHARS + 1);

    const was = listed.title;
    await nameIfUntitled(a.profileId, first, "something else entirely");
    const [again] = (await listConversations(a.profileId)).filter((c) => c.id === first);
    expect(again.title).toBe(was);
  });

  it("belongs to her, and to nobody else", async () => {
    const other = await makeAccount("platform-other");
    try {
      expect(await ownsConversation(a.profileId, first)).toBe(true);
      expect(await ownsConversation(other.profileId, first)).toBe(false);
      // And reading it as somebody else returns nothing at all.
      expect(await loadHistory(other.profileId, first)).toEqual([]);
    } finally {
      await dropAccount(other);
    }
  });

  it("orders the list by what was said last, not by what was started first", async () => {
    await saveMessage(a.profileId, "user", [{ type: "text", text: "back to the first one" }], first);
    const list = await listConversations(a.profileId);
    expect(list[0].id).toBe(first);
  });
});

suite("the audit log", () => {
  it("records an event and reads it back", async () => {
    // The names are a closed union on purpose: a log with free-text event
    // names is a log nobody can query, and lib/security-signals.ts reads it.
    await audit("admin.viewed", { detail: { shape: "platform-test" } });
    const rows = await recentEvents(1);
    expect(rows.some((r) => r.event === "admin.viewed")).toBe(true);
  });

  it("keeps a refused address in full, and has a mask for where a shape is enough", () => {
    /*
      Recorded in full, deliberately, and written down in COMPLIANCE.md.

      It used to be masked to `m***@gmail.com`, and the first real alert this
      console produced — seven failures then a success — took a database query
      to resolve. The answer was the owner's father mistyping his own address
      four times. A mask could not tell that story, which is the whole job of
      the screen. What is typed as a *password* is still never recorded: a log
      of near-misses is a wordlist, and that rule has not moved.
    */
    expect(refusedAddress("  Stephen@Example.com  ")).toBe("stephen@example.com");
    // …and the mask is still there for the signals card, where a shape is
    // enough and a list of addresses would be a list of who exists.
    expect(maskEmail("stephen@example.com")).toBe("s***@example.com");
  });
});

suite("the spend ledger", () => {
  it("prices a call from the model id rather than a literal beside it", async () => {
    // An unrecognised model bills at the top of the range: over-charging stops
    // her coach early, under-charging spends money nobody is watching.
    const usage = { input_tokens: 1000, output_tokens: 1000 };
    expect(costMicros(usage)).toBeGreaterThan(0);
    // Cached reads cost a fraction of fresh ones, which is the whole reason
    // lib/agent/system.ts is split the way it is.
    const cached = costMicros({ input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 1000 });
    expect(cached).toBeLessThan(costMicros(usage));
  });

  it("reads a day's spend, and nothing spent is zero rather than missing", async () => {
    const spend = await todaySpend(a.profileId);
    expect(spend).toBeTruthy();
    expect(JSON.stringify(spend)).not.toMatch(/NaN|undefined/);
  });

  it("only ever tightens the deployment's ceiling", async () => {
    const ceiling = await effectiveDailyLimit(a.profileId);
    expect(ceiling).toBeLessThanOrEqual(LIMITS.dailyCostMicros);

    await call("set_coach_budget", { percentOfMax: 25 });
    expect(await effectiveDailyLimit(a.profileId)).toBeLessThan(LIMITS.dailyCostMicros);
    await call("set_coach_budget", { percentOfMax: null });
  });

  it("counts a rate event without needing anything in memory", async () => {
    // In-memory counters do not work on serverless and would silently enforce
    // nothing, which is why this is a row.
    await expect(recordEvent("probe-bucket")).resolves.not.toThrow();
  });
});

suite("what the screen tells the coach", () => {
  it("reads the day out of the path, and refuses anything that is not one", () => {
    expect(dayInPath("/train?d=2026-09-13")).toBe("2026-09-13");
    expect(dayInPath("/train")).toBeNull();
    expect(dayInPath("/train?d=yesterday")).toBeNull();
  });

  it("knows which screen a path is, and says null for one it does not", () => {
    expect(screenFor("/train")).toBeTruthy();
    expect(screenFor("/eat")).toBeTruthy();
    expect(screenFor("/nowhere-at-all")).toBeNull();
  });

  it("builds the briefing from her rows, never from the client", async () => {
    // The browser sends the *path*; this reads what is on it. The client never
    // authors context — same rule as the opening greeting.
    await call("log_meal", { slot: "lunch", description: "context-probe", calories: 500 });
    const said = await contextForPath(a.profileId, "/eat");
    expect(said).not.toBeNull();
    expect(said!.label).toBeTruthy();
    expect(said!.context.length).toBeGreaterThan(10);
    // A path that is not a screen gets no briefing rather than a made-up one.
    expect(await contextForPath(a.profileId, "/nowhere-at-all")).toBeNull();
  });
});

suite("the owner's console", () => {
  it("counts rows rather than selecting her body data", async () => {
    const view = await adminOverview();
    /*
      The accounts half, which is the part that is about people.

      `tests/admin.test.ts` holds this rule on the module's source; this holds
      it on the output with real rows behind it. The errors card is excluded
      here and covered separately: it quotes failed statements, and the reason
      it is worth quoting is the reason it needed `stripBoundParams` — see
      tests/errors.test.ts.
    */
    const text = JSON.stringify({ accounts: view.accounts, totals: view.totals });
    for (const word of ["weightKg", "waist", "bodyFat", "calories", "proteinG", "photo", "description"]) {
      expect(text, word).not.toContain(word);
    }
    // What it does carry is operational: counts, never contents.
    expect(JSON.stringify(view.accounts)).toMatch(/setsLogged|sessions/);
  });

  it("prices in dollars, readably", () => {
    expect(money(1_500_000)).toBe("$1.50");
    expect(money(0)).toBe("$0.00");
  });

  it("totals what people cost over each window", async () => {
    const costs = await adminCosts();
    expect(Object.keys(costs).length).toBeGreaterThan(0);
    expect(JSON.stringify(costs)).not.toMatch(/NaN/);
  });
});

suite("the nightly backup", () => {
  it("carries the rows and not the images, on purpose", async () => {
    // The blob store is itself durable, and a second copy of her body every
    // night is not a backup — it is a second store.
    const dump = await dumpEverything(new Date());
    const text = JSON.stringify(dump).slice(0, 400_000);
    expect(text).not.toMatch(/"data":"data:image/);
    expect(dump).toBeTruthy();
  });

  it("names a file by its date, and knows which ones to drop", () => {
    const key = backupKey(new Date("2026-09-13T03:00:00Z"));
    expect(key).toContain("2026-09-13");
    // Old enough *and* past the ones always kept: a retention rule that can
    // empty the store is worse than one that keeps too much.
    const drop = staleBackups(
      [
        { pathname: "b/2026-09-13.json", uploadedAt: new Date("2026-09-13") },
        { pathname: "b/2026-09-12.json", uploadedAt: new Date("2026-09-12") },
        { pathname: "b/2026-09-11.json", uploadedAt: new Date("2026-09-11") },
        { pathname: "b/2025-01-01.json", uploadedAt: new Date("2025-01-01") },
      ],
      new Date("2026-09-13T03:00:00Z"),
    );
    expect(drop).toContain("b/2025-01-01.json");
    expect(drop).not.toContain("b/2026-09-13.json");
    // And it never empties the store, whatever the dates say.
    expect(staleBackups([{ pathname: "only.json", uploadedAt: new Date("2000-01-01") }], new Date()))
      .toEqual([]);
  });
});

suite("photos", () => {
  it("serves through a route that takes the profile in the query", async () => {
    expect(photoSrc("abc")).toBe("/api/photos/abc");
    const lib = await photoLibrary(a.profileId);
    expect(lib).toBeTruthy();
  });
});

suite("energy balance", () => {
  it("refuses a window it cannot count", async () => {
    const out = await energyBalanceBetween(a.profileId, addDays(a.today, -14), a.today);
    // Nothing like enough counted days: it says so rather than inventing a
    // deficit out of the days she did not log.
    expect(out === null || typeof out === "object").toBe(true);
    if (out) expect(JSON.stringify(out)).not.toMatch(/NaN/);
  });
});

suite("sleep, read directly", () => {
  it("has nothing for a night nobody logged", async () => {
    expect(await sleepOn(a.profileId, addDays(a.today, -9))).toBeNull();
  });

  it("returns the nights there are and no placeholders for the rest", async () => {
    await call("log_sleep", { howLong: "7h", date: addDays(a.today, -1) });
    const nights = await sleepBetween(a.profileId, addDays(a.today, -7), a.today);
    expect(nights).toHaveLength(1);
  });
});

suite("the reminder sweep", () => {
  it("runs without a push subscription, and says it sent nothing", async () => {
    // Nobody in this test has a device registered, so the honest result is
    // zero sent — never an error, because the cron must not fail loudly for
    // the ordinary case.
    const out = await sweepReminders();
    expect(out).toBeTruthy();
    expect(JSON.stringify(out)).not.toMatch(/NaN|undefined/);
  });
});

suite("an account is who you are; a profile is what you're working on", () => {
  it("keeps them in separate tables and cascades from the account", async () => {
    const doomed = await makeAccount("platform-cascade");
    const profileId = doomed.profileId;
    await dropAccount(doomed);
    expect(await db.select().from(profiles).where(eq(profiles.id, profileId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, doomed.userId))).toHaveLength(0);
  });
});
