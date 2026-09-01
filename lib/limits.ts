import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, rateEvents, usageDaily } from "@/lib/db/schema";
import { today } from "@/lib/date";
import { PRICING, type Pricing } from "@/lib/agent/model";

/**
 * Cost control and abuse limits.
 *
 * Everything lives in Postgres rather than process memory: on serverless each
 * request can land on a fresh instance, so an in-memory counter would reset
 * constantly and enforce nothing.
 */

const num = (name: string, fallback: number) => {
  // An empty or whitespace-only value means "not set", not zero. Number("") is
  // 0 — finite and >= 0 — so without this the fallback never runs, and a blank
  // DAILY_COST_LIMIT_MICROS in a hosting dashboard would pin the ceiling at
  // zero and refuse every message.
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const LIMITS = {
  /** Millionths of a dollar. Default 500_000 = $0.50/day ≈ $15/month ceiling. */
  get dailyCostMicros() { return num("DAILY_COST_LIMIT_MICROS", 500_000); },
  get chatPerDay() { return num("MAX_CHAT_PER_DAY", 250); },
  get chatPerMinute() { return num("MAX_CHAT_PER_MINUTE", 8); },
  get loginAttemptsPerHour() { return num("MAX_LOGIN_ATTEMPTS_PER_HOUR", 10); },
  /** Across every IP — the ceiling that IP rotation cannot get around. */
  get loginAttemptsPerHourGlobal() { return num("MAX_LOGIN_ATTEMPTS_PER_HOUR_GLOBAL", 200); },
  /** Longest message accepted, in characters. */
  get maxMessageChars() { return num("MAX_MESSAGE_CHARS", 4_000); },
  /**
   * Direct tool calls a minute. Generous, because these are taps: logging a
   * set between reps, stepping a weight, ticking off a meal. It exists to
   * bound a runaway client or a stolen session, not to pace her.
   */
  get actionsPerMinute() { return num("MAX_ACTIONS_PER_MINUTE", 120); },
};

/** cost(micros) = tokens × USD-per-million. The units cancel exactly. */
export function costMicros(
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
  pricing: Pricing = PRICING,
): number {
  return Math.round(
    (usage.input_tokens ?? 0) * pricing.input +
    (usage.output_tokens ?? 0) * pricing.output +
    (usage.cache_read_input_tokens ?? 0) * pricing.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * pricing.cacheWrite,
  );
}

export type UsageSource = "app" | "eval";

export async function recordUsage(
  usage: Parameters<typeof costMicros>[0],
  source: UsageSource = "app",
  pricing?: Pricing,
  profileId?: string,
) {
  if (source === "app" && !profileId) {
    // Not fatal — the spend is real and must still be recorded — but it means
    // some path is spending without an owner, and todaySpend counts these
    // against everyone precisely so it cannot go unnoticed or unlimited.
    console.error("[limits] app usage recorded with no profile — spend is unattributed");
  }
  const row = {
    date: today(),
    source,
    profileId: profileId ?? null,
    requests: 1,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    costMicros: costMicros(usage, pricing),
  };
  await db.insert(usageDaily).values(row).onConflictDoUpdate({
    target: [usageDaily.date, usageDaily.source, usageDaily.profileId],
    set: {
      requests: sql`${usageDaily.requests} + 1`,
      inputTokens: sql`${usageDaily.inputTokens} + ${row.inputTokens}`,
      outputTokens: sql`${usageDaily.outputTokens} + ${row.outputTokens}`,
      cacheReadTokens: sql`${usageDaily.cacheReadTokens} + ${row.cacheReadTokens}`,
      cacheWriteTokens: sql`${usageDaily.cacheWriteTokens} + ${row.cacheWriteTokens}`,
      costMicros: sql`${usageDaily.costMicros} + ${row.costMicros}`,
    },
  });
}

/**
 * Her budget: the configured ceiling, tightened by whatever she chose in the
 * app. Deliberately one-directional — a setting that could RAISE the ceiling
 * would mean a stolen session could lift the cap and spend freely, which is the
 * exact failure the cap exists to prevent.
 */
export async function effectiveDailyLimit(profileId?: string): Promise<number> {
  const ceiling = LIMITS.dailyCostMicros;
  if (!profileId) return ceiling;

  const [row] = await db
    .select({ chosen: profiles.dailyBudgetMicros })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  return row?.chosen == null ? ceiling : Math.min(row.chosen, ceiling);
}

/**
 * Spend that counts against a person's budget — their own app traffic only,
 * never eval runs and never anyone else's. Scoped per profile so one talkative
 * account cannot switch the coach off for everybody.
 */
export async function todaySpend(profileId?: string) {
  // Her own app spend, plus any app spend that failed to be attributed.
  // Unattributed rows would otherwise escape every ceiling — spend that counts
  // against nobody is spend with no limit, which is the one thing this must
  // never allow. Eval rows are excluded by the source filter.
  const rows = await db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.date, today()), eq(usageDaily.source, "app")));

  const mine = rows.filter((r) => r.profileId === profileId || r.profileId === null);

  return {
    costMicros: mine.reduce((n, r) => n + r.costMicros, 0),
    requests: mine.reduce((n, r) => n + r.requests, 0),
    unattributedMicros: rows
      .filter((r) => r.profileId === null)
      .reduce((n, r) => n + r.costMicros, 0),
    limitMicros: await effectiveDailyLimit(profileId),
    ceilingMicros: LIMITS.dailyCostMicros,
  };
}

/** Count events in a bucket within the trailing window. */
async function countRecent(bucket: string, seconds: number): Promise<number> {
  const since = new Date(Date.now() - seconds * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rateEvents)
    .where(and(eq(rateEvents.bucket, bucket), gte(rateEvents.at, since)));
  return row?.n ?? 0;
}

export async function recordEvent(bucket: string) {
  await db.insert(rateEvents).values({ bucket });
  // Opportunistic prune keeps the table from growing without a cron job.
  if (Math.random() < 0.02) {
    await db.delete(rateEvents).where(lt(rateEvents.at, new Date(Date.now() - 86_400_000)));
  }
}

export type Denial = { allowed: false; reason: string };
export type Allowance = { allowed: true };

/**
 * The gate in front of every model call. Checks the cheap limits first so an
 * abusive burst is rejected without extra database work.
 */
export async function checkChatAllowed(profileId?: string): Promise<Allowance | Denial> {
  // Buckets are per person. A shared bucket would mean one user's burst is
  // everyone's rate limit.
  const bucket = `chat:${profileId ?? "anon"}`;
  const perMinute = await countRecent(bucket, 60);
  if (perMinute >= LIMITS.chatPerMinute) {
    return { allowed: false, reason: "Slow down a moment — too many messages at once. Try again shortly." };
  }

  const perDay = await countRecent(bucket, 86_400);
  if (perDay >= LIMITS.chatPerDay) {
    return { allowed: false, reason: "That's today's message limit. Your coach will be back tomorrow — everything else still works." };
  }

  const spend = await todaySpend(profileId);
  if (spend.costMicros >= spend.limitMicros) {
    return { allowed: false, reason: "Today's usage budget is spent. Your coach is back tomorrow — logging, plans and progress all still work." };
  }

  await recordEvent(bucket);
  return { allowed: true };
}

/**
 * Two ceilings, because the per-IP one is only as trustworthy as the client
 * address. `x-forwarded-for` is ultimately client-supplied, so an attacker can
 * rotate it and get a fresh per-IP budget every request. The global ceiling is
 * what actually makes brute force hopeless — it cannot be rotated around.
 */
export async function checkLoginAllowed(ip: string, email?: string): Promise<Allowance | Denial> {
  const [perIp, perAccount, global] = await Promise.all([
    countRecent(`login:ip:${ip}`, 3600),
    // Per account as well as per IP: an attacker rotating addresses against one
    // account is the case a per-IP limit alone misses.
    email ? countRecent(`login:acct:${email}`, 3600) : Promise.resolve(0),
    countRecent("login:*", 3600),
  ]);

  if (perIp >= LIMITS.loginAttemptsPerHour || perAccount >= LIMITS.loginAttemptsPerHour) {
    return { allowed: false, reason: "Too many attempts. Try again in an hour." };
  }
  // The global ceiling is the backstop against a distributed attack. It has to
  // scale with the number of accounts, or one attacked user locks out the rest.
  if (global >= LIMITS.loginAttemptsPerHourGlobal) {
    return { allowed: false, reason: "Too many attempts. Try again in an hour." };
  }
  return { allowed: true };
}

export async function recordLoginAttempt(ip: string, email?: string) {
  await Promise.all([
    recordEvent(`login:ip:${ip}`),
    email ? recordEvent(`login:acct:${email}`) : Promise.resolve(),
    recordEvent("login:*"),
  ]);
}

/**
 * On Vercel the proxy sets `x-real-ip` itself, so it is preferred over
 * `x-forwarded-for`, whose leftmost entry the client controls.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0];
  return (real ?? fwd ?? "unknown").trim().slice(0, 45) || "unknown";
}

/**
 * Is there budget left to make a model call at all?
 *
 * checkChatAllowed also enforces the message rate and records an event against
 * it, which is right for a turn of conversation and wrong everywhere else: a
 * planner call made *during* a turn would spend a second message from her
 * allowance for one thing she asked for.
 *
 * This is the spend half on its own, so it can guard a model call made from
 * anywhere without distorting the rate limit. The standing rule is that every
 * model call is gated before it is made, not merely recorded after — recording
 * alone lets an unbounded caller run past the cap and only notice afterwards.
 */
export async function checkSpendAllowed(
  profileId?: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const spend = await todaySpend(profileId);
  if (spend.costMicros >= spend.limitMicros) {
    return {
      allowed: false,
      reason: "Today's usage budget is spent. Your coach is back tomorrow — logging, plans and progress all still work.",
    };
  }
  return { allowed: true };
}

/**
 * The gate in front of direct tool calls from the browser.
 *
 * /api/action reaches every registered tool, so it had the same reach as the
 * chat route with none of its limits. Cheap taps dominate here, so the ceiling
 * is high; the spend cap is enforced separately and at the model call itself,
 * because two of those tools plan a week with Sonnet.
 */
export async function checkActionAllowed(profileId: string): Promise<Allowance | Denial> {
  const bucket = `action:${profileId}`;
  if (await countRecent(bucket, 60) >= LIMITS.actionsPerMinute) {
    return { allowed: false, reason: "Too many requests at once. Give it a moment." };
  }
  await recordEvent(bucket);
  return { allowed: true };
}
