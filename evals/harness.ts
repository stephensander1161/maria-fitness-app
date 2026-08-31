import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, usageDaily, type Profile } from "@/lib/db/schema";
import { runCoach } from "@/lib/agent/loop";
import { today } from "@/lib/date";
import { judge } from "./judge";

/**
 * The behavioural harness.
 *
 * It drives the real agent loop — same system prompt, same tool registry, same
 * database — because the bugs these evals exist to catch are all in the seam
 * between what the coach *says* and what it actually *did*. A mock would not
 * have caught a single one of them.
 *
 * Isolation is the one hard rule: every eval runs against a scratch profile row
 * created for it and deleted afterwards. Nothing here ever calls
 * lib/profile.ts getProfile(), which resolves to *her* row.
 */

export type Turn = {
  user: string;
  /** Everything the coach streamed back, concatenated. */
  text: string;
  /** Tools that actually ran this turn, in completion order. */
  tools: string[];
  error?: string;
};

export type Check = {
  name: string;
  kind: "hard" | "soft";
  ok: boolean;
  detail: string;
};

export type EvalCase = {
  name: string;
  /** The real bug this is a regression test for. Printed on failure. */
  bug: string;
  /** Column values for the scratch profile row this case runs against. */
  profile: Partial<typeof profiles.$inferInsert>;
  /** Insert whatever history the case needs, scoped to the scratch profile. */
  seed?: (profileId: string) => Promise<void>;
  run: (ctx: EvalContext) => Promise<void>;
};

export type EvalResult = {
  name: string;
  bug: string;
  passed: boolean;
  checks: Check[];
  turns: Turn[];
  ms: number;
  /** Coach spend for this eval, read from the app's own usage ledger. */
  coach: UsageDelta;
};

export class EvalContext {
  readonly checks: Check[] = [];
  readonly turns: Turn[] = [];

  constructor(readonly profileId: string) {}

  /**
   * One user turn through the real loop.
   *
   * The profile row is re-read every turn, exactly as /api/chat does it — the
   * system prompt's state block is built from it, so an onboarding eval only
   * sees a fact land if it was genuinely persisted.
   */
  async say(text: string): Promise<Turn> {
    const profile = await this.profile();
    let out = "";
    const tools: string[] = [];
    let error: string | undefined;

    // Tagged as eval spend so a paid regression run cannot silently consume
    // her daily coach budget and switch the app off for the rest of the day.
    for await (const event of runCoach(profile, text, { source: "eval" })) {
      if (event.type === "text") out += event.text;
      else if (event.type === "tool" && event.status === "done") tools.push(event.name);
      else if (event.type === "error") error = event.message;
    }

    const turn: Turn = { user: text, text: out.trim(), tools, error };
    this.turns.push(turn);
    if (error) this.hard("the turn completed", false, `runCoach errored: ${error}`);
    return turn;
  }

  async profile(): Promise<Profile> {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, this.profileId)).limit(1);
    if (!p) throw new Error("scratch profile vanished mid-eval");
    return p;
  }

  /** Deterministic assertion — a tool call, or a value in the database. */
  hard(name: string, ok: boolean, detail: string) {
    this.checks.push({ name, kind: "hard", ok, detail });
    return ok;
  }

  /** Prose assertion, graded by the judge. See judge.ts for why. */
  async soft(
    name: string,
    opts: { criterion: string; reply: string; context?: string },
  ): Promise<boolean> {
    const verdict = await judge(opts);
    this.checks.push({ name, kind: "soft", ok: verdict.pass, detail: verdict.reason });
    return verdict.pass;
  }
}

/* ── running one case ──────────────────────────────────────────────────── */

export async function runEval(c: EvalCase): Promise<EvalResult> {
  const started = Date.now();
  const before = await usageSnapshot();

  const [row] = await db.insert(profiles).values(c.profile).returning();
  await registerScratch(row.id);
  const ctx = new EvalContext(row.id);

  try {
    if (c.seed) await c.seed(row.id);
    await c.run(ctx);
  } catch (err) {
    ctx.hard("the eval ran to completion", false, err instanceof Error ? err.message : String(err));
  } finally {
    // Deleting the profile cascades to every row that hangs off it: weigh-ins,
    // plans, workouts, set logs, meal logs, photos, chat history.
    await db.delete(profiles).where(eq(profiles.id, row.id));
    await unregisterScratch(row.id);
  }

  return {
    name: c.name,
    bug: c.bug,
    passed: ctx.checks.length > 0 && ctx.checks.every((k) => k.ok),
    checks: ctx.checks,
    turns: ctx.turns,
    ms: Date.now() - started,
    coach: deltaSince(before, await usageSnapshot()),
  };
}

/* ── spend accounting ──────────────────────────────────────────────────── */

export type UsageDelta = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
};

/**
 * Coach cost is read from the app's own ledger rather than re-priced here.
 * runCoach calls recordUsage() on every iteration, and that row is priced with
 * PRICING from lib/agent/model.ts — so when the owner swaps COACH_MODEL, these
 * numbers follow automatically instead of quietly reporting Haiku prices.
 *
 * Eval turns are recorded under source "eval", which is both what keeps them
 * out of her daily budget and what this has to read — the "app" row does not
 * move during a run. The spend is still real money; run.ts reports it.
 */
export async function usageSnapshot(): Promise<UsageDelta> {
  const [row] = await db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.date, today()), eq(usageDaily.source, "eval")))
    .limit(1);
  return {
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    cacheReadTokens: row?.cacheReadTokens ?? 0,
    cacheWriteTokens: row?.cacheWriteTokens ?? 0,
    costMicros: row?.costMicros ?? 0,
  };
}

const deltaSince = (a: UsageDelta, b: UsageDelta): UsageDelta => ({
  inputTokens: Math.max(0, b.inputTokens - a.inputTokens),
  outputTokens: Math.max(0, b.outputTokens - a.outputTokens),
  cacheReadTokens: Math.max(0, b.cacheReadTokens - a.cacheReadTokens),
  cacheWriteTokens: Math.max(0, b.cacheWriteTokens - a.cacheWriteTokens),
  costMicros: Math.max(0, b.costMicros - a.costMicros),
});

export const addUsage = (a: UsageDelta, b: UsageDelta): UsageDelta => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  costMicros: a.costMicros + b.costMicros,
});

/* ── scratch-row registry ──────────────────────────────────────────────── */

/**
 * try/finally covers a failing eval; it does not cover `kill -9` or a laptop
 * lid. Scratch profile ids are journalled outside the repo so the next run can
 * sweep whatever the last one abandoned. Only ids this harness wrote are ever
 * deleted — nothing here selects a profile it did not create.
 */
const REGISTRY = path.join(os.tmpdir(), "coach-eval-scratch-profiles.json");

async function readRegistry(): Promise<string[]> {
  try {
    const raw = await fs.readFile(REGISTRY, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const writeRegistry = (ids: string[]) =>
  fs.writeFile(REGISTRY, JSON.stringify(ids), "utf8").catch(() => {});

async function registerScratch(id: string) {
  await writeRegistry([...(await readRegistry()), id]);
}

async function unregisterScratch(id: string) {
  await writeRegistry((await readRegistry()).filter((x) => x !== id));
}

/** Returns how many orphans a previous crashed run left behind. */
export async function sweepOrphans(): Promise<number> {
  const ids = await readRegistry();
  let removed = 0;
  for (const id of ids) {
    const result = await db.delete(profiles).where(eq(profiles.id, id)).returning({ id: profiles.id });
    removed += result.length;
  }
  await writeRegistry([]);
  return removed;
}
