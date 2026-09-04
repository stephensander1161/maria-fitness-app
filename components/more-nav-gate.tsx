import { currentUser } from "@/lib/session";
import { MoreNav } from "./more-nav";

/** Admin is only offered to an owner, so the row is never a locked door. */
export async function MoreNavGate() {
  const user = await currentUser();
  if (!user) return null;
  return <MoreNav isOwner={user.role === "owner"} />;
}
