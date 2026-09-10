import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { profileToday } from "@/lib/profile";
import { titleEarned } from "@/lib/views";
import { TitleEarned } from "./title-earned";

/**
 * Tells her when the rank went up.
 *
 * It changed in silence before this: the greeting bar simply read something
 * different one morning, and the one thing in this app that says something
 * about *her* rather than about the app went by without being mentioned.
 *
 * Checked on every page because the score moves for several reasons — a set,
 * a finished session, a milestone, another week of the streak — and pinning
 * the check to any one of them would miss the others. It costs the query
 * `titleStats` already runs for the greeting bar.
 *
 * The read lives in lib/views.ts, like every other screen read; the write
 * goes through the registry as `acknowledge_title`.
 */
export async function TitleGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const earned = await titleEarned(profile, profileToday(profile));
  if (!earned) return null;

  return (
    <TitleEarned
      name={earned.rank.name}
      blurb={earned.rank.blurb}
      number={earned.number}
      of={earned.of}
    />
  );
}
