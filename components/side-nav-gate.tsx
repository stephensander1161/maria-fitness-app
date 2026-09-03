import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { SideNav } from "./side-nav";

/**
 * The account holder's name, not the profile's.
 *
 * They are usually the same person and were assumed to be — but the profile is
 * *what you are working on* and the account is *who you are*, so a husband
 * signed in to set up his wife's plan was greeted by her name in his own
 * sidebar.
 */
export async function SideNavGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;
  return <SideNav name={user.name ?? profile.name} />;
}
