import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { buddyState } from "@/lib/views";
import { bark, condition, fullness, modeFor } from "@/lib/buddy";
import { Companion } from "./companion";

/**
 * He speaks in the same register the coach does, about her own data.
 *
 * `profiles.coach_tone` decides how hard he is about a set that was merely
 * fine — see reactionFor. Signed out, there is nobody to be hard on.
 *
 * Everything else he shows is read here, on the server, from her rows: how
 * big he is comes from what she has actually trained this fortnight, how full
 * he is from today's protein, and what he says from whichever of those most
 * needs saying. Nothing is picked at random and nothing missing is counted as
 * a zero — lib/buddy.ts is mostly that one distinction.
 */
export async function CompanionGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return <Companion tone={profile.coachTone} />;

  const state = await buddyState(profile);
  return (
    <Companion
      tone={profile.coachTone}
      scale={condition(state).scale}
      fullness={fullness(state)}
      bark={bark(state).text}
      barkKind={bark(state).kind}
      mode={modeFor(state)}
    />
  );
}
