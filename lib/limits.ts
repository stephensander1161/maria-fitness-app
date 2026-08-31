import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateEvents, usageDaily } from "@/lib/db/schema";
import { today } from "@/lib/date";
import { PRICING } from "@/lib/agent/model";

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
  get loginAttemptsPerHourGlobal() { return num("MAX_LOGIN_ATTEMPTS_PER_HOUR_GLOBAL", 40); },
  /** Longest message accepted, in characters. */
  get maxMessageChars() { return num("MAX_MESSAGE_CHARS", 4_000); },
};

/** cost(micros) = tokens × USD-per-million. The units cancel exactly. */
export function costMicros(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): number {
  return Math.round(
    (usage.input_tokens ?? 0) * PRICING.input +
    (usage.output_tokens ?? 0) * PRICING.output +
    (usage.cache_read_input_tokens ?? 0) * PRICING.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * PRICING.cacheWrite,
  );
}

export async function recordUsage(usage: Parameters<typeof costMicros>[0]) {
  const row = {
    date: today(),
    requests: 1,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    costMicros: costMicros(usage),
  };
  await db.insert(usageDaily).values(row).onConflictDoUpdate({
    target: usageDaily.date,
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

export async function todaySpend() {
  const [row] = await db.select().from(usageDaily).where(eq(usageDaily.date, today())).limit(1);
  return {
    costMicros: row?.costMicros ?? 0,
    requests: row?.requests ?? 0,
    limitMicros: LIMITS.dailyCostMicros,
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
export async function checkChatAllowed(): Promise<Allowance | Denial> {
  const perMinute = await countRecent("chat", 60);
  if (perMinute >= LIMITS.chatPerMinute) {
    return { allowed: false, reason: "Slow down a moment — too many messages at once. Try again shortly." };
  }

  const perDay = await countRecent("chat", 86_400);
  if (perDay >= LIMITS.chatPerDay) {
    return { allowed: false, reason: "That's today's message limit. Your coach will be back tomorrow — everything else still works." };
  }

  const spend = await todaySpend();
  if (spend.costMicros >= spend.limitMicros) {
    return { allowed: false, reason: "Today's usage budget is spent. Your coach is back tomorrow — logging, plans and progress all still work." };
  }

  await recordEvent("chat");
  return { allowed: true };
}

/**
 * Two ceilings, because the per-IP one is only as trustworthy as the client
 * address. `x-forwarded-for` is ultimately client-supplied, so an attacker can
 * rotate it and get a fresh per-IP budget every request. The global ceiling is
 * what actually makes brute force hopeless — it cannot be rotated around.
 */
export async function checkLoginAllowed(ip: string): Promise<Allowance | Denial> {
  const [perIp, global] = await Promise.all([
    countRecent(`login:${ip}`, 3600),
    countRecent("login:*", 3600),
  ]);
  if (perIp >= LIMITS.loginAttemptsPerHour || global >= LIMITS.loginAttemptsPerHourGlobal) {
    return { allowed: false, reason: "Too many attempts. Try again in an hour." };
  }
  return { allowed: true };
}

export async function recordLoginAttempt(ip: string) {
  await Promise.all([recordEvent(`login:${ip}`), recordEvent("login:*")]);
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
