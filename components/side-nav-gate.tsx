import { currentUser } from "@/lib/session";
import { getProfile, profileToday } from "@/lib/profile";
import { titleStats } from "@/lib/views";
import { SideNav } from "./side-nav";
import { logoMarkOf } from "@/lib/logo-mark";

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
  // The eyebrow above her name used to say "Coach", which is the app's name
  // and tells her nothing about herself.
  const title = await titleStats(profile, profileToday(profile));
  return (
    <SideNav
      // Her choice of mark, read here rather than in the component: the
      // sidebar is a client component and this is the only place on that path
      // that is allowed to touch the database.
      mark={logoMarkOf(profile.logoMark).id}
      name={user.name ?? profile.name}
      title={title}
      isOwner={user.role === "owner"}
      recovering={profile.postpartumBirthDate !== null}
    />
  );
}
