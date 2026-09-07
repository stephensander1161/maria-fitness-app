import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { shippedForProfile, whatsNewForProfile } from "@/lib/views";
import { WhatsNewNote } from "./whats-new-note";
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

  // One note at a time, and the personal one first: something she asked for
  // outranks something that merely shipped.
  const items = await shippedForProfile(profile.id);
  if (items.length > 0) return <ShippedNote items={items} />;
  const fresh = await whatsNewForProfile(profile, user.role === "owner");
  if (fresh.length === 0) return null;
  return <WhatsNewNote items={fresh} />;
}
