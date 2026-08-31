import { Coach } from "@/components/coach";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const profile = await getProfile();
  return <Coach initialName={profile.name} />;
}
