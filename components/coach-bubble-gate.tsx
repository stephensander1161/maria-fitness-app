import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { CoachBubble } from "./coach-bubble";

/**
 * The bubble needs her name and needs to not exist for a signed-out visitor.
 * Both are server questions, so they are answered here rather than by a fetch
 * from the client on every screen.
 */
export async function CoachBubbleGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;
  return <CoachBubble name={profile.name} />;
}
