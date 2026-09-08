import { recentForDisplay } from "@/lib/agent/history";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Transcript for the coach screen, tool traffic stripped out.
 *
 * `?before=<message id>` walks backwards through it a page at a time — the
 * sheet asks for the next page when she scrolls to the top. The id is only
 * ever used as a cursor within her own transcript: the query is scoped to her
 * profile, so someone else's id simply matches nothing.
 */
export async function GET(req: Request) {
  // The proxy proved the token; this proves the account is still valid.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  const page = await recentForDisplay(profile.id, 40, before);
  return Response.json({
    profileId: profile.id,
    onboarded: profile.onboardedAt !== null,
    name: profile.name,
    messages: page.messages,
    hasMore: page.hasMore,
    oldestId: page.oldestId,
  });
}
