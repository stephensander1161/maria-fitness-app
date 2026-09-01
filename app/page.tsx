import { Coach } from "@/components/coach";
import { getProfile } from "@/lib/profile";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return <Coach initialName={profile.name} />;
}
