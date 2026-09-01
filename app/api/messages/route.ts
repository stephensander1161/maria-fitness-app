import { recentForDisplay } from "@/lib/agent/history";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";

/** Transcript for the coach screen, tool traffic stripped out. */
export async function GET() {
  // Middleware proved the token; this proves the account is still valid.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  return Response.json({
    profileId: profile.id,
    onboarded: profile.onboardedAt !== null,
    name: profile.name,
    messages: await recentForDisplay(profile.id),
  });
}
