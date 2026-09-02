import { currentUser } from "@/lib/session";
import { getProfile, profileToday } from "@/lib/profile";
import { factForDay } from "@/lib/facts";

/**
 * One thing worth knowing, at the bottom of every screen.
 *
 * It used to appear only while pulling down to refresh, which meant it was
 * hidden behind a gesture, gone the moment she let go, and marked as seen
 * either way — a fact she never actually read, never shown again.
 *
 * The same fact all day, deliberately: a new one per page load would burn the
 * whole library in an afternoon, and every one of them would be recorded as
 * read.
 */
export async function DailyFact() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;

  const fact = await factForDay(profile.id, profileToday(profile));
  if (!fact) return null;

  return (
    <aside className="mt-8 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[10px] uppercase tracking-wide text-accent">Did you know</p>
      <p className="mt-1 text-[13px] leading-relaxed text-text">{fact.text}</p>
      {fact.source && <p className="mt-1.5 text-[11px] text-faint">{fact.source}</p>}
    </aside>
  );
}
