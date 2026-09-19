import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { workouts } from "@/lib/db/schema";
import { addDays, type ISODate } from "@/lib/date";

/**
 * The day she is training on, which is not always the day it is.
 *
 * A workout that runs past midnight is still the same workout. Her calendar
 * day rolls over at 00:00, and everything keyed to it rolled with it: the
 * Train screen swapped to tomorrow's plan mid-session, the sets she had
 * just logged left the screen, and the GO screen — seeded from whatever
 * day is on screen — offered her the following day's movements. "If I work
 * out past midnight, the GO notification jumps to whatever is in the
 * following day."
 *
 * So while a session she started is open and still going, that session's
 * day is the day. It carries for six hours from the first set, which is
 * longer than any session and shorter than a night: one left running
 * because she forgot to sign off does not take over the next morning, and
 * the day arrows are there either way.
 */
export type OpenSession = { date: ISODate; startedAt: Date };

/** How long a session's day outlives the calendar's. */
export const CARRY_HOURS = 6;

export function trainingDay(
  her: ISODate,
  open: OpenSession | null,
  now: Date = new Date(),
  carryHours: number = CARRY_HOURS,
): ISODate {
  // Nothing open, or open on today or later: the day is the day.
  if (!open || open.date >= her) return her;
  const hours = (now.getTime() - open.startedAt.getTime()) / 3_600_000;
  return hours >= 0 && hours < carryHours ? open.date : her;
}

/**
 * The most recent session she has not signed off, from today or the day
 * before. Only those two: a workout left open last week says nothing about
 * what she is doing now, and `trainingDay` would refuse it anyway.
 */
export async function openSessionNear(profileId: string, her: ISODate): Promise<OpenSession | null> {
  const [row] = await db
    .select({ date: workouts.date, startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(
      eq(workouts.profileId, profileId),
      isNull(workouts.completedAt),
      gte(workouts.date, addDays(her, -1)),
    ))
    .orderBy(desc(workouts.date))
    .limit(1);
  return row ? { date: row.date as ISODate, startedAt: row.startedAt } : null;
}
