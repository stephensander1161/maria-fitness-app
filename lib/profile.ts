import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";

/**
 * Single-user app today: the first profile row is hers. The rest of the code
 * only ever receives a profileId, so adding real auth later means changing
 * this function and nothing else.
 */
export async function getProfile(): Promise<Profile> {
  const [existing] = await db.select().from(profiles).orderBy(asc(profiles.createdAt)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(profiles).values({}).returning();
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
