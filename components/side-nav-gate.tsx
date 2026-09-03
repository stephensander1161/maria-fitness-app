import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { SideNav } from "./side-nav";

/** Her name, and nothing at all for a signed-out visitor. */
export async function SideNavGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (!profile.onboardedAt) return null;
  return <SideNav name={profile.name} />;
}
