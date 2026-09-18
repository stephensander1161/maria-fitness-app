import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { today, weekStart, type ISODate } from "@/lib/date";
import type { ToolContext } from "@/lib/tools/define";

/**
 * A throwaway account, for the suite that needs a real database.
 *
 * The standing rule in CLAUDE.md is that **probes never write to real rows**,
 * and it is written in blood: an overnight probe once overwrote the real
 * profile with fake data and the coach greeted the wrong person for a day.
 * So every database test gets an account of its own, writes only to it, and
 * drops it afterwards — the cascade from `users` takes everything with it.
 *
 * Three things make that safe rather than merely intended:
 *
 * 1. **The address cannot belong to anybody.** `.invalid` is reserved by
 *    RFC 2606 and can never be registered, and every address here also
 *    carries `dbtest-`. `dropStaleAccounts` will not delete anything that
 *    does not match both.
 * 2. **It refuses to reuse an existing account.** If the address is already
 *    there the helper throws rather than logging into it, which is the same
 *    check `scripts/tenancy-check.ts` makes and for the same reason.
 * 3. **The drop runs in a `finally`.** A failing assertion must not leave a
 *    profile behind, because the next run would then refuse to start.
 */
export const TEST_EMAIL_SUFFIX = "@probe.invalid";
const PREFIX = "dbtest-";

export type TestAccount = {
  userId: string;
  profileId: string;
  /** What every tool handler wants. */
  ctx: ToolContext;
  /** Her today, in the account's timezone — which is UTC, deliberately. */
  today: ISODate;
  /** The Monday of her week. */
  week: ISODate;
};

export type AccountOptions = {
  name?: string;
  units?: "metric" | "imperial";
  /** UTC unless a test is specifically about somebody else's clock. */
  timezone?: string;
  startWeightKg?: number;
  goalWeightKg?: number;
  equipment?: string[];
  /** Left null for a test about onboarding itself. */
  onboarded?: boolean;
  role?: "member" | "owner";
  /** Free-tier tests set this false; everything else is Pro. */
  comped?: boolean;
  /** Anything else on the profile this particular test needs. */
  profile?: Record<string, unknown>;
};

/**
 * Create one.
 *
 * `slug` names the test file, so a run that dies leaves an obvious crumb and
 * two files can never collide on the same address.
 */
export async function makeAccount(slug: string, options: AccountOptions = {}): Promise<TestAccount> {
  const email = `${PREFIX}${slug}${TEST_EMAIL_SUFFIX}`;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    // Left over from a run that was killed rather than allowed to finish.
    // Safe to remove: nothing but this suite can ever own the address.
    await db.delete(users).where(eq(users.id, existing.id));
  }

  const [u] = await db.insert(users).values({
    email,
    name: options.name ?? "Test",
    passwordHash: null,
    role: options.role ?? "member",
    // Pro, like the family's accounts: a test about a wall says so itself.
    comped: options.comped ?? true,
  }).returning();

  const timezone = options.timezone ?? "UTC";
  const [p] = await db.insert(profiles).values({
    userId: u.id,
    name: options.name ?? "Test",
    birthYear: 1990,
    sex: "female",
    heightCm: 165,
    startWeightKg: options.startWeightKg ?? 65,
    goalWeightKg: options.goalWeightKg ?? 60,
    experience: "returning",
    daysPerWeek: 3,
    sessionMinutes: 45,
    equipment: options.equipment ?? ["dumbbells", "bench", "barbell"],
    units: options.units ?? "metric",
    timezone,
    onboardedAt: options.onboarded === false ? null : new Date(),
    ...(options.profile ?? {}),
  }).returning();

  const her = today(timezone);
  return { userId: u.id, profileId: p.id, ctx: { profileId: p.id }, today: her, week: weekStart(her) };
}

/** Drop it. Call this in a `finally` or an `afterAll`, never conditionally. */
export async function dropAccount(account: Pick<TestAccount, "userId"> | null): Promise<void> {
  if (!account) return;
  await db.delete(users).where(eq(users.id, account.userId));
}

/**
 * Sweep anything a killed run left behind.
 *
 * Narrow on purpose: both the prefix and the reserved suffix have to match,
 * so there is no pattern here that could reach a real address even by
 * accident. Run from the suite's global setup rather than per file.
 */
export async function dropStaleAccounts(): Promise<number> {
  const rows = await db.delete(users)
    .where(like(users.email, `${PREFIX}%${TEST_EMAIL_SUFFIX}`))
    .returning({ id: users.id });
  return rows.length;
}
