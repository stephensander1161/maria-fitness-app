import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { morningWeighIn } from "@/lib/views";
import { WeighInPrompt } from "./weigh-in-prompt";

/**
 * This morning's weigh-in — and last night's sleep with it, if that is still
 * outstanding too.
 *
 * Both questions are the server's — whether a row exists for her today, and
 * what time it is where she is — so they are answered here rather than by a
 * fetch from the client on every screen. Whether she has already waved it
 * away today is the browser's, and is answered there.
 */
export async function WeighInGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const ask = await morningWeighIn(profile);
  if (!ask) return null;

  return (
    <WeighInPrompt
      seed={ask.seed}
      unit={ask.unit}
      today={ask.today}
      askSleep={ask.askSleep}
      name={user.name ?? profile.name}
    />
  );
}
