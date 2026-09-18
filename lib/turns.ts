import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import type { ISODate } from "@/lib/date";

/** How many messages she has sent the coach on her day — the free plan's unit. */
export async function turnsToday(profileId: string, day: ISODate): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(messages)
    .where(and(eq(messages.profileId, profileId), eq(messages.role, "user"), gte(messages.createdAt, new Date(`${day}T00:00:00Z`))));
  return Number(row?.n ?? 0);
}
