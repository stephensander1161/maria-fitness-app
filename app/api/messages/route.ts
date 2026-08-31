import { recentForDisplay } from "@/lib/agent/history";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";

/** Transcript for the coach screen, tool traffic stripped out. */
export async function GET() {
  const profile = await getProfile();
  return Response.json({
    profileId: profile.id,
    onboarded: profile.onboardedAt !== null,
    name: profile.name,
    messages: await recentForDisplay(profile.id),
  });
}
