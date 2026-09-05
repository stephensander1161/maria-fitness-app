import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { shippedForProfile } from "@/lib/views";
import { ShippedNote } from "./shipped-note";

/**
 * Shows her the things she asked for that have since shipped.
 *
 * The read lives in lib/views.ts, like every other screen read — components
 * in this app never touch the database, and the invariant test says so.
 * Writing still goes through the registry; see acknowledge_shipped.
 */
export async function ShippedNoteGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const items = await shippedForProfile(profile.id);
  if (items.length === 0) return null;
  return <ShippedNote items={items} />;
}
