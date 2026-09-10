import { sql } from "drizzle-orm";
import { setLogs, workouts } from "@/lib/db/schema";

/**
 * Whether a session happened, as a database predicate.
 *
 * The rule is `sessionHappened` in lib/week-done.ts, and the reasoning is
 * there: `completed_at` is set by the Finish workout button, nobody presses
 * it, and a button is a record of how long a session took rather than what
 * decides that it took place. The work decides.
 *
 * This exists because that rule was applied in one place and not the others.
 * On one Progress screen the week said "3 of 6 sessions" and the streak said
 * "2 days", from the same three days of training — Monday had twenty sets
 * logged and no Finish pressed, so it counted for one number and not the
 * other. Two counters disagreeing about the same week is worse than either
 * being wrong on its own, because it tells her the app is not reading her
 * training so much as guessing at it.
 *
 * So there is one predicate and every count uses it.
 */
export const workoutHappened = sql`(
  ${workouts.completedAt} is not null
  or exists (select 1 from ${setLogs} where ${setLogs.workoutId} = ${workouts.id})
)`;
