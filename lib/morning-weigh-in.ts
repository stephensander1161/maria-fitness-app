/**
 * Whether to put the scale in front of her the moment she opens the app.
 *
 * The weigh-in lives on Progress, which is two taps away and behind a screen
 * about last week — so the number that every target, every trend and every
 * milestone is computed from gets logged when she happens to remember. Asking
 * once, on the first open of the day, is the difference between a trend that
 * can answer and one that refuses to.
 *
 * Three rules, and the third is the one that is easy to get wrong.
 */

import type { ISODate } from "@/lib/date";

/**
 * The day starts at five in the morning, not at midnight.
 *
 * Her request, and she is right: training past midnight puts her on a new
 * calendar date while she is still in the middle of last night's session, and
 * a full-screen "step on the scale" between two sets of curls is the app
 * interrupting the thing it exists to help with. Nothing before 5am.
 *
 * It also happens to be the right rule for the measurement. A weight taken at
 * one in the morning, fed and watered and after a session, is not the same
 * quantity as one taken on waking, and the trend is built out of those.
 */
export const DAY_BEGINS_HOUR = 5;

export function shouldAskToWeigh(input: {
  /** Her local hour, 0–23, in her own timezone. */
  hour: number;
  /** Whether a weigh-in already exists for her today. */
  loggedToday: boolean;
  /** The date she last put this away, from this browser. */
  dismissedOn: string | null;
  /** Her today. */
  today: ISODate;
  /** Off entirely, for someone who does not weigh themselves. */
  wanted?: boolean;
}): boolean {
  if (input.wanted === false) return false;
  // Already answered, in either sense.
  if (input.loggedToday) return false;
  if (input.dismissedOn === input.today) return false;
  // Not in the small hours.
  if (!Number.isFinite(input.hour)) return false;
  return input.hour >= DAY_BEGINS_HOUR;
}

/** The key this browser remembers the answer under. Per viewer, per day. */
export const DISMISS_KEY = "weighIn.skipped";
