import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { Companion } from "./companion";

/**
 * He speaks in the same register the coach does.
 *
 * `profiles.coach_tone` decides how hard he is about a set that was merely
 * fine — see reactionFor. Signed out, there is nobody to be hard on.
 */
export async function CompanionGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return <Companion tone={profile.coachTone} />;
}
