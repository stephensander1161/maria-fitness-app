import { currentUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";
import { MoreNav } from "./more-nav";

/** Admin is only offered to an owner, so the row is never a locked door. */
export async function MoreNavGate() {
  const user = await currentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  return <MoreNav isOwner={user.role === "owner"} recovering={profile.postpartumBirthDate !== null} />;
}
