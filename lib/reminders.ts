import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, pushSubscriptions, weighIns } from "@/lib/db/schema";
import { APP_TIMEZONE, hourIn, today } from "@/lib/date";
import { pushConfigured, sendPush } from "@/lib/push";
import { runTool } from "@/lib/tools";

/**
 * The weigh-in nudge.
 *
 * Deliberately independent of how often it is swept. The first version
 * compared the current hour to her chosen one for an exact match, which needs
 * an hourly schedule — and the hosting plan turned out to allow one sweep a
 * day, so an exact match would almost never have fired. The hosting plan
 * should not decide whether she gets reminded.
 *
 * So the rule is "her hour has come and gone, and she has not been nudged
 * today": with an hourly sweep that lands within the hour she asked for, and
 * with a daily sweep it lands at whatever time that runs. Same code, same one
 * notification a day, different punctuality.
 *
 * The hour is a *local* hour, compared per profile, because the same instant
 * is 7am in one place and 3pm in another — the standing rule that the clock
 * and the day belong to her.
 *
 * It never nudges about something already done: a weigh-in logged today, in
 * her timezone, skips her. A reminder to do a thing you have finished is how
 * notifications get switched off for good.
 *
 * A dead endpoint is removed rather than retried — a 404 or 410 means the
 * browser threw the subscription away, and keeping it means failing every
 * hour for ever. That removal goes through the registry like every other
 * write, so there is still exactly one path into the database.
 */
export type SweepResult = {
  considered: number;
  sent: number;
  dropped: number;
  skipped: number;
  configured: boolean;
};

export async function sweepReminders(): Promise<SweepResult> {
  if (!pushConfigured()) {
    return { considered: 0, sent: 0, dropped: 0, skipped: 0, configured: false };
  }

  const due = await db
    .select({
      id: profiles.id,
      hour: profiles.weighInReminderHour,
      timezone: profiles.timezone,
      remindedOn: profiles.weighInRemindedOn,
    })
    .from(profiles)
    .where(and(isNotNull(profiles.weighInReminderHour), isNotNull(profiles.onboardedAt)));

  let sent = 0;
  let dropped = 0;
  let skipped = 0;

  for (const person of due) {
    const zone = person.timezone ?? APP_TIMEZONE;
    const herToday = today(zone);

    // Not yet her hour, once today already, or already on the scale.
    if (person.hour === null || hourIn(zone) < person.hour) { skipped += 1; continue; }
    if (person.remindedOn === herToday) { skipped += 1; continue; }

    const [already] = await db
      .select({ date: weighIns.date })
      .from(weighIns)
      .where(and(eq(weighIns.profileId, person.id), eq(weighIns.date, herToday)))
      .limit(1);
    if (already) { skipped += 1; continue; }

    const devices = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.profileId, person.id));

    let reached = false;
    for (const device of devices) {
      const outcome = await sendPush(device.endpoint);
      if (outcome === "sent") { sent += 1; reached = true; }
      else if (outcome === "gone") {
        await runTool("forget_push_device", { endpoint: device.endpoint }, { profileId: person.id });
        dropped += 1;
      }
      // Anything else is a bad moment for the push service, not a dead
      // device. The next sweep tries again, and because nothing is recorded
      // she has not used up today's reminder on a failure.
    }
    if (reached) {
      await runTool("record_weigh_in_reminder", { date: herToday }, { profileId: person.id });
    }
  }

  return { considered: due.length, sent, dropped, skipped, configured: true };
}
