import { and, count, desc, eq, gte, isNotNull, max, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  auditLog, feedback, mealLogs, messages, profiles, setLogs, usageDaily, users, weighIns, workouts,
} from "@/lib/db/schema";
import { currentUser } from "@/lib/session";
import { securitySignals, type Signal } from "@/lib/security-signals";
import { addDays, today, type ISODate } from "@/lib/date";
import type { User } from "@/lib/db/schema";

/**
 * The owner's view of the deployment.
 *
 * **It is operational, not personal.** Who has an account, whether they are
 * using it, what the coach is costing, and what the security log says. It
 * deliberately carries none of anyone's body or training detail — no weight,
 * no measurements, no photos, no meals, no conversation — because the owner
 * being able to read another adult's weigh-ins is the same failure the friends
 * feature exists to avoid, only with no consent step at all. Counts and dates
 * answer "is this working for them"; the numbers themselves are theirs.
 *
 * There are no tools for any of this, on purpose: `users` is out of the
 * model's reach, so this is a page-only read model. That is also why it does
 * not live in lib/views.ts, which is the read layer the coach's screens share.
 */

/** Server components only. Sends a non-owner back to the app rather than 404ing. */
export async function requireOwner(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");
  return user;
}

export type AccountRow = {
  userId: string;
  profileId: string | null;
  email: string;
  name: string | null;
  role: "owner" | "member";
  disabled: boolean;
  /** How they can actually get in. An invitation nobody has claimed is neither. */
  signsInWith: ("password" | "google")[];
  createdAt: string;
  lastLoginAt: string | null;
  onboarded: boolean;
  timezone: string | null;
  sessions: number;
  sessionsLast7: number;
  lastSessionOn: string | null;
  setsLogged: number;
  weighIns: number;
  daysLoggedFood: number;
  coachMessages: number;
  /** Millionths of a dollar, so the arithmetic stays integer. */
  spendTodayMicros: number;
  spend30dMicros: number;
  openFeedback: number;
};

export type AdminOverview = {
  accounts: AccountRow[];
  totals: { accounts: number; active30d: number; spendTodayMicros: number; spend30dMicros: number };
  recentEvents: { at: string; event: string; severity: string; ip: string | null; detail: string | null }[];
  /** What the log is worth telling someone about — see lib/security-signals.ts. */
  signals: (Omit<Signal, "lastAt"> & { lastAt: string })[];
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : null);

export async function adminOverview(): Promise<AdminOverview> {
  // One global day for the spend window, deliberately: this is the deployment's
  // ledger, not any one person's day, and it must match how lib/limits.ts
  // buckets spend or the two would disagree.
  const day: ISODate = today();
  const from30: ISODate = addDays(day, -29);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const accountRows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabledAt: users.disabledAt,
      passwordHash: users.passwordHash,
      googleSub: users.googleSub,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      profileId: profiles.id,
      onboardedAt: profiles.onboardedAt,
      timezone: profiles.timezone,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(users.createdAt);

  const accounts = await Promise.all(accountRows.map(async (u): Promise<AccountRow> => {
    const base: AccountRow = {
      userId: u.userId,
      profileId: u.profileId,
      email: u.email,
      name: u.name,
      role: u.role,
      disabled: Boolean(u.disabledAt),
      // Never the hash itself, only whether one exists — the same rule the
      // audit log follows.
      signsInWith: [
        ...(u.passwordHash ? ["password" as const] : []),
        ...(u.googleSub ? ["google" as const] : []),
      ],
      createdAt: iso(u.createdAt)!,
      lastLoginAt: iso(u.lastLoginAt),
      onboarded: Boolean(u.onboardedAt),
      timezone: u.timezone,
      sessions: 0, sessionsLast7: 0, lastSessionOn: null, setsLogged: 0,
      weighIns: 0, daysLoggedFood: 0, coachMessages: 0,
      spendTodayMicros: 0, spend30dMicros: 0, openFeedback: 0,
    };
    if (!u.profileId) return base;

    const p = u.profileId;
    const done = and(eq(workouts.profileId, p), isNotNull(workouts.completedAt));
    const [[sessions], [recent], [lastOn], [sets], [weights], [foodDays], [msgs], [spendToday], [spend30], [open]] =
      await Promise.all([
        db.select({ n: count() }).from(workouts).where(done),
        db.select({ n: count() }).from(workouts).where(and(done, gte(workouts.date, addDays(day, -6)))),
        db.select({ d: max(workouts.date) }).from(workouts).where(done),
        db.select({ n: count() }).from(setLogs)
          .innerJoin(workouts, eq(setLogs.workoutId, workouts.id))
          .where(eq(workouts.profileId, p)),
        db.select({ n: count() }).from(weighIns).where(eq(weighIns.profileId, p)),
        db.select({ n: sql<number>`count(distinct ${mealLogs.date})::int` }).from(mealLogs)
          .where(eq(mealLogs.profileId, p)),
        db.select({ n: count() }).from(messages).where(eq(messages.profileId, p)),
        db.select({ c: sql<number>`coalesce(sum(${usageDaily.costMicros}), 0)::bigint` }).from(usageDaily)
          .where(and(eq(usageDaily.profileId, p), eq(usageDaily.date, day))),
        db.select({ c: sql<number>`coalesce(sum(${usageDaily.costMicros}), 0)::bigint` }).from(usageDaily)
          .where(and(eq(usageDaily.profileId, p), gte(usageDaily.date, from30))),
        db.select({ n: count() }).from(feedback)
          .where(and(eq(feedback.profileId, p), eq(feedback.status, "new"))),
      ]);

    return {
      ...base,
      sessions: sessions?.n ?? 0,
      sessionsLast7: recent?.n ?? 0,
      lastSessionOn: (lastOn?.d as string | null) ?? null,
      setsLogged: sets?.n ?? 0,
      weighIns: weights?.n ?? 0,
      daysLoggedFood: foodDays?.n ?? 0,
      coachMessages: msgs?.n ?? 0,
      spendTodayMicros: Number(spendToday?.c ?? 0),
      spend30dMicros: Number(spend30?.c ?? 0),
      openFeedback: open?.n ?? 0,
    };
  }));

  // Two different reads of the same log. The table shows the last handful;
  // the analysis needs the whole window, or a burst of failures from a month
  // ago is invisible the moment twenty-five newer events exist.
  const events = await db
    .select().from(auditLog)
    .where(gte(auditLog.at, since30))
    .orderBy(desc(auditLog.at))
    .limit(1000);

  // The owner opening their own console is not news, and one row per visit
  // would push the events that matter off the bottom of the table.
  const interesting = events.filter((e) => e.event !== "admin.viewed");

  const signals = securitySignals(
    interesting.map((e) => ({
      at: e.at, event: e.event, severity: e.severity, ip: e.ip,
      detail: e.detail as Record<string, unknown> | null,
    })),
    new Set(accountRows.map((u) => u.userId)),
  );

  return {
    accounts,
    totals: {
      accounts: accounts.length,
      // "Signed in within the last 30 days" — the only activity signal that
      // does not require reading anything of theirs.
      active30d: accounts.filter((a) => a.lastLoginAt && new Date(a.lastLoginAt) >= since30).length,
      spendTodayMicros: accounts.reduce((n, a) => n + a.spendTodayMicros, 0),
      spend30dMicros: accounts.reduce((n, a) => n + a.spend30dMicros, 0),
    },
    signals: signals.map((sig) => ({ ...sig, lastAt: iso(sig.lastAt)! })),
    recentEvents: interesting.slice(0, 25).map((e) => ({
      at: iso(e.at)!,
      event: e.event,
      severity: e.severity,
      ip: e.ip,
      // Whatever the event carried, already scrubbed of credentials and body
      // data at the point it was written — see lib/audit.ts.
      detail: e.detail ? JSON.stringify(e.detail) : null,
    })),
  };
}

/** Millionths of a dollar as money. */
export const money = (micros: number): string => `$${(micros / 1_000_000).toFixed(2)}`;
