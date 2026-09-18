import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { PRO_ONLY, type Feature } from "@/lib/tier-messages";

export { PRO_ONLY, type Feature };

/**
 * Free and Pro, and what each may do.
 *
 * Two tiers, on purpose, and nearly all of it is this one table so the line
 * can move without a rebuild. Free is the trial that never ends: logging,
 * charts, titles, plans from templates, food from the library, and a small
 * coach — a few turns a day, so a stranger meets the thing that makes the
 * app worth paying for. Pro is everything on.
 *
 * Entitlement is what Stripe says (`subscription_status`, written only by
 * the webhook) or a `comped` flag an owner sets by hand — never a claim the
 * browser makes. Family is comped; Maria never sees a wall. A comped account
 * also keeps the deployment's own spend ceiling rather than the Pro one:
 * the founders playtest at three times what a customer will.
 *
 * The numbers, 2026-09-18: measured spend was 23¢ per person-day on
 * average and 45¢ at most — founders, playtesting hard, planner runs on
 * the bigger model. A customer at CA$5 a month capped at 20¢ a day costs
 * at most $6 in a month and, on a typical day, a few cents.
 */
export type Tier = "free" | "pro";

export const TIERS = {
  free: {
    /** Coach turns a day. A turn is one message from her. */
    coachTurnsPerDay: 5,
    /** Model spend a day, in millionths of a dollar — enough for those turns. */
    dailyCostMicros: 50_000,
    features: new Set<Feature>(),
  },
  pro: {
    coachTurnsPerDay: Infinity,
    dailyCostMicros: 200_000,
    features: new Set<Feature>(["planner", "kitchen", "camera", "estimator"]),
  },
} as const;

import { PRO_PRICE } from "@/lib/tier-prices";
export { PRO_PRICE };

/** Subscription states that mean paid. `past_due` keeps access through Stripe's retries. */
const PAID = new Set(["active", "trialing", "past_due"]);

export type Entitled = { comped: boolean; subscriptionStatus: string | null };

export function tierOf(u: Entitled | null | undefined): Tier {
  if (!u) return "free";
  if (u.comped) return "pro";
  return u.subscriptionStatus && PAID.has(u.subscriptionStatus) ? "pro" : "free";
}

export const hasFeature = (tier: Tier, feature: Feature): boolean => TIERS[tier].features.has(feature);

/** The day's model-spend ceiling this account gets, before the deployment's own. */
export const tierCeilingMicros = (u: Entitled | null | undefined): number =>
  u?.comped ? Infinity : TIERS[tierOf(u)].dailyCostMicros;

/** The account behind a profile. */
export async function entitledFor(profileId: string): Promise<Entitled | null> {
  const [row] = await db.select({ comped: users.comped, subscriptionStatus: users.subscriptionStatus })
    .from(profiles).innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.id, profileId)).limit(1);
  return row ?? null;
}
