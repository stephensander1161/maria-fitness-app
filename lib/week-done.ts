/**
 * Which planned sessions actually happened.
 *
 * This used to be one line — a planned day is done when a *completed* workout
 * points at it — and both halves of that were wrong in the same week.
 *
 * `completedAt` is set by the Finish workout button. Nobody presses it. She
 * trained biceps and triceps, logged twenty sets, walked out of the gym, and
 * Progress told her she had missed the session. A button is a record of how
 * long the session took; it is not what decides whether it took place. The
 * work is what decides.
 *
 * `planDayId` is bound once, when the session row is created, and a row
 * created before that week's plan existed is bound to nothing. Hers said
 * "Freestyle session" on the Monday the plan called Biceps and Triceps,
 * because she started logging before anything had rolled the programme
 * forward into the new week. So the date has to count too: a planned Monday
 * with sets logged on it is a Monday she did, whatever the row remembers.
 *
 * Pure, because every one of those cases is a test rather than a screenshot.
 */

export type PlannedDay = { id: string; dayOfWeek: number; title: string };

export type Session = {
  planDayId: string | null;
  title: string;
  /** 0 = Monday … 6 = Sunday, for the date the session is filed under. */
  dayOfWeek: number;
  /** How many sets are logged against it. */
  sets: number;
  /** Whether Finish workout was pressed. */
  completed: boolean;
};

/** A session counts as having happened once there is work in it. */
export function sessionHappened(s: Session): boolean {
  return s.sets > 0 || s.completed;
}

export function dayIsDone(day: PlannedDay, sessions: Session[]): boolean {
  return sessions.some((s) => {
    if (!sessionHappened(s)) return false;
    // Bound to this day outright.
    if (s.planDayId === day.id) return true;
    // Filed on this day's date. The row may have been created before the
    // plan reached this week, in which case it is bound to nothing at all.
    if (s.planDayId === null && s.dayOfWeek === day.dayOfWeek) return true;
    // Started freeform and named the same thing. Kept from the old rule: a
    // session logged on the wrong date still ticks the day it was named for.
    // Only for unbound sessions — matching on title alone once let a single
    // "Full body" tick off every day that shared the name.
    if (s.planDayId === null && s.title === day.title) return true;
    return false;
  });
}

/**
 * The week split three ways, against her today.
 *
 * `todayIndex` is 0–6 inside the week and 7 for a week that is over, so
 * Wednesday's session is never "missed" on Tuesday — a screen that says she
 * is behind on something she is not behind on is a screen she stops reading.
 * Today itself is *remaining*, not missed: it is still hers to do.
 */
export function splitWeek(
  plannedDays: PlannedDay[], sessions: Session[], todayIndex: number,
): { doneDays: string[]; missedDays: string[]; remainingDays: string[] } {
  const done: PlannedDay[] = [];
  const notDone: PlannedDay[] = [];
  for (const d of plannedDays) (dayIsDone(d, sessions) ? done : notDone).push(d);
  return {
    doneDays: done.map((d) => d.title),
    missedDays: notDone.filter((d) => d.dayOfWeek < todayIndex).map((d) => d.title),
    remainingDays: notDone.filter((d) => d.dayOfWeek >= todayIndex).map((d) => d.title),
  };
}
