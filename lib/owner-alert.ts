import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles, pushSubscriptions, users } from "@/lib/db/schema";
import { pushConfigured, sendPush } from "@/lib/push";
import { runTool } from "@/lib/tools";

/**
 * Ring every owner's registered device.
 *
 * Deliberately *not* in `lib/tools/`. This reads `users` to find who the
 * owners are, and no module in the registry may touch that table — the
 * invariant is structural, so that no prompt can reach a password, an account
 * or a role however cleverly it is asked. A tool calls this; the tool's own
 * file never mentions accounts.
 *
 * The push carries nothing, as every push here does: the service worker asks
 * the app what it is about when it lands. A dead subscription is dropped
 * through the same tool the reminder sweep uses, so one path forgets devices.
 */
export async function alertOwners(): Promise<void> {
  if (!pushConfigured()) return;
  const owners = await db
    .select({ profileId: profiles.id, endpoint: pushSubscriptions.endpoint })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.profileId, profiles.id))
    .where(eq(users.role, "owner"));

  for (const owner of owners) {
    const outcome = await sendPush(owner.endpoint);
    if (outcome === "gone") {
      await runTool("forget_push_device", { endpoint: owner.endpoint }, { profileId: owner.profileId });
    }
  }
}
