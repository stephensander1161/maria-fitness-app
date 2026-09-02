import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";
import { APP_TIMEZONE, today, type ISODate } from "@/lib/date";
import { foodUnitsOf } from "@/lib/food-units";
import type { Units } from "@/lib/units";

/**
 * Her training profile, created on first sign-in. One profile per account: the
 * account is who you are, the profile is what you're working on.
 */
export async function getProfile(userId: string): Promise<Profile> {
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.createdAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db.insert(profiles).values({ userId }).returning();
  return created;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return p ?? null;
}

/** What the coach still needs before it can responsibly generate a plan. */
export function missingForPlan(p: Profile): string[] {
  return [
    !p.name && "name",
    !p.birthYear && "age",
    !p.sex && "sex",
    !p.heightCm && "height",
    !p.startWeightKg && "current weight",
    !p.goalWeightKg && "goal weight",
    !p.daysPerWeek && "days per week available",
    !p.sessionMinutes && "session length",
    p.equipment.length === 0 && "equipment or gym access",
    !p.experience && "training experience",
  ].filter((x): x is string => typeof x === "string");
}

/**
 * Her timezone, falling back to the deployment default. Day-level dates must be
 * computed here rather than in the server's zone: Vercel runs UTC, so an
 * evening workout would otherwise land on the following day.
 */
export const zoneOf = (p: Pick<Profile, "timezone">): string =>
  p.timezone ?? APP_TIMEZONE;

/** Today, in her timezone. */
export const profileToday = (p: Pick<Profile, "timezone">): ISODate => today(zoneOf(p));

/**
 * Today in the timezone of one profile, by id.
 *
 * The same lookup was written locally in two tool files and simply skipped in
 * the rest, which left the app dating meals, photos and views by the server's
 * zone while dating sets, weigh-ins and measurements by hers. Those agree only
 * while APP_TIMEZONE happens to match the one profile — a second user anywhere
 * else gets their dinner filed on the wrong day.
 */
export async function todayForProfile(profileId: string): Promise<ISODate> {
  const { db } = await import("@/lib/db");
  const { profiles } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [p] = await db.select({ timezone: profiles.timezone }).from(profiles)
    .where(eq(profiles.id, profileId)).limit(1);
  return profileToday(p ?? { timezone: null });
}

/**
 * How one profile measures food, by id — for tools that hand back recipes,
 * ingredient lines and shopping quantities. Falls back to the body units when
 * she has not set the kitchen separately (see lib/food-units.ts).
 */
export async function foodUnitsFor(profileId: string): Promise<Units> {
  const [p] = await db.select({ units: profiles.units, foodUnits: profiles.foodUnits }).from(profiles)
    .where(eq(profiles.id, profileId)).limit(1);
  // A missing profile used to fall through to imperial, which would quietly
  // relabel every gram in her kitchen as an ounce. Every caller of this has a
  // profile id that came from a session, so no profile means something is
  // wrong upstream and it should say so rather than pick a unit system.
  if (!p) throw new Error(`No profile ${profileId} — cannot choose units for it.`);
  return foodUnitsOf(p);
}

/**
 * Her age in years, from the year she was born.
 *
 * One implementation because there were four, each doing
 * `new Date().getFullYear() - birthYear` — which drifts by up to a year
 * depending on whether her birthday has passed, and reads the server's year.
 * Approximate by construction: the app stores a birth *year*, so this is the
 * best it can do, and every caller should get the same approximation.
 */
export const ageFrom = (birthYear: number | null, asOf: ISODate): number | null =>
  birthYear === null ? null : Number(asOf.slice(0, 4)) - birthYear;
