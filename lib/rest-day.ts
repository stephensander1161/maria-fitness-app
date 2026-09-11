/**
 * What makes a day a rest day.
 *
 * The flag and the title are what somebody *called* it. The movements on it
 * are what is actually there, and when the two disagree the movements win.
 *
 * This is not a detail. `planSummary` renders a rest day as the single word
 * "rest" and lists none of its exercises, so a day flagged rest with four
 * movements added to it reached the coach as nothing at all — and the state
 * block is the thing the model believes completely. It told her it was a rest
 * day while she was looking at the session she had built on it, and it was not
 * being careless: it had been handed a sentence that said so.
 *
 * The flag still decides an empty day, because that is the difference between
 * a day she has deliberately left clear and one she has not filled in yet —
 * "Rest" and "Nothing planned" are different things to be told.
 */
export function isRestDay(day: { isRest: boolean; movements: number }): boolean {
  return day.movements === 0 && day.isRest;
}

/**
 * Rest days titled "Rest" read fine; a *session* still titled "Rest" does not.
 *
 * Same rule one layer up: once there is work on the day, a title left over
 * from when there wasn't is worse than no title.
 */
export function dayTitle(day: { title: string; isRest: boolean; movements: number }): string {
  if (isRestDay(day)) return day.title;
  return /^rest\b/i.test(day.title) ? "Session" : day.title;
}
