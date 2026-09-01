import { Coach } from "@/components/coach";
import { requireOnboarded } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const profile = await requireOnboarded();
  return <Coach initialName={profile.name} />;
}
