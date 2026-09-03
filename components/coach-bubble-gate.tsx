import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { CoachBubble } from "./coach-bubble";

/**
 * The bubble needs her name and needs to not exist for a signed-out visitor.
 * Both are server questions, so they are answered here rather than by a fetch
 * from the client on every screen.
 *
 * The *account holder's* name, not the profile's — the same distinction the
 * sidebar had to learn. The profile is what you are working on; the account is
 * who you are, and a husband signed in to set up his wife's plan was greeted
 * by her name.
 */
export async function CoachBubbleGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;
  return <CoachBubble name={user.name ?? profile.name} />;
}
