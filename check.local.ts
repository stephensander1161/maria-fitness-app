import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, setLogs, users, workouts } from "@/lib/db/schema";
import { profileToday } from "@/lib/profile";
import { weekStart, addDays, dayIndex } from "@/lib/date";
async function main() {
  const [u] = await db.select().from(users).where(eq(users.email, "stephen.sander1@gmail.com"));
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
  const her = profileToday(p); const wk = weekStart(her); const end = addDays(wk, 6);
  const rows = await db.select({
    date: workouts.date, planDayId: workouts.planDayId, title: workouts.title,
    completedAt: workouts.completedAt,
    sets: sql<number>`(select count(*)::int from ${setLogs} where ${setLogs.workoutId} = ${workouts.id})`,
  }).from(workouts)
    .where(and(eq(workouts.profileId, p.id), gte(workouts.date, wk), lte(workouts.date, end)));
  for (const r of rows) console.log(JSON.stringify(r), "typeof date:", typeof r.date, "typeof sets:", typeof r.sets, "dayIndex:", dayIndex(r.date as never));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
