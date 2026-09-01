import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { requireUser } from "@/lib/session";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  // Already set up — nothing to do here.
  if (profile.onboardedAt) redirect("/");

  return <Onboarding defaultName={profile.name ?? user.name} />;
}
