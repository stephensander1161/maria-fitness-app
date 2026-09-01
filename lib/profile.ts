import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";

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
