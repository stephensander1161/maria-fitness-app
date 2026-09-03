import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, pushSubscriptions, weighIns } from "@/lib/db/schema";
import { APP_TIMEZONE, hourIn, today } from "@/lib/date";
import { pushConfigured, sendPush } from "@/lib/push";
import { runTool } from "@/lib/tools";

/**
 * The weigh-in nudge, swept once an hour.
 *
 * Sends to whoever's chosen hour it currently is *where they are*, which is
 * why the hour is stored as a local hour and compared per profile rather than
 * converted once. The same instant is 7am in one place and 3pm in another,
 * and this app's standing rule is that the clock and the day belong to her.
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
    .select({ id: profiles.id, hour: profiles.weighInReminderHour, timezone: profiles.timezone })
    .from(profiles)
    .where(and(isNotNull(profiles.weighInReminderHour), isNotNull(profiles.onboardedAt)));

  let sent = 0;
  let dropped = 0;
  let skipped = 0;

  for (const person of due) {
    const zone = person.timezone ?? APP_TIMEZONE;
    if (hourIn(zone) !== person.hour) { skipped += 1; continue; }

    // Her today, not the server's — the whole reason the zone is stored.
    const [already] = await db
      .select({ date: weighIns.date })
      .from(weighIns)
      .where(and(eq(weighIns.profileId, person.id), eq(weighIns.date, today(zone))))
      .limit(1);
    if (already) { skipped += 1; continue; }

    const devices = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.profileId, person.id));

    for (const device of devices) {
      const outcome = await sendPush(device.endpoint);
      if (outcome === "sent") sent += 1;
      else if (outcome === "gone") {
        await runTool("forget_push_device", { endpoint: device.endpoint }, { profileId: person.id });
        dropped += 1;
      }
      // Anything else is a bad hour for the push service, not a dead device.
      // Next hour will try again; there is nothing to record.
    }
  }

  return { considered: due.length, sent, dropped, skipped, configured: true };
}
