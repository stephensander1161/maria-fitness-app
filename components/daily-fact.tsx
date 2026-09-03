import { currentUser } from "@/lib/session";
import { getProfile, profileToday } from "@/lib/profile";
import { factForDay } from "@/lib/facts";
import { FactCard } from "@/components/fact-card";

/**
 * One thing worth knowing, at the bottom of every screen.
 *
 * It used to appear only while pulling down to refresh, which meant it was
 * hidden behind a gesture, gone the moment she let go, and marked as seen
 * either way — a fact she never actually read, never shown again.
 *
 * The same fact all day, deliberately: a new one per page load would burn the
 * whole library in an afternoon, and every one of them would be recorded as
 * read. Reading on is a tap, not a page load — see FactCard.
 */
export async function DailyFact() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const fact = await factForDay(profile.id, profileToday(profile));
  if (!fact) return null;

  return <FactCard first={fact} />;
}
