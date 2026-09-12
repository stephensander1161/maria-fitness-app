import { listConversations, ownsConversation, recentForDisplay } from "@/lib/agent/history";
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
 *
 * `?conversation=<id>` picks the thread. Absent means the one she was last
 * in — which is what "continue that" needs — and `?conversation=new` means
 * she is starting one, so there is nothing to show yet. The id is checked
 * against her profile before anything is read out of it.
 *
 * The thread list rides along on the same request. It is the other half of
 * the same screen and asking for it separately is a second round trip on
 * every open of the sheet.
 */
export async function GET(req: Request) {
  // The proxy proved the token; this proves the account is still valid.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  const params = new URL(req.url).searchParams;
  const before = params.get("before") ?? undefined;
  const asked = params.get("conversation");

  if (asked && asked !== "new" && !(await ownsConversation(profile.id, asked))) {
    return Response.json({ error: "No such conversation" }, { status: 404 });
  }
  // `new` is a thread she has not started: null, and nothing to load.
  // Anything else is the thread she named, and nothing named is "whatever is
  // in her transcript", which is what the old single-thread view showed.
  const conversation = asked === "new" ? null : asked ?? undefined;

  const [page, threads] = await Promise.all([
    recentForDisplay(profile.id, 40, before, conversation),
    listConversations(profile.id),
  ]);
  return Response.json({
    profileId: profile.id,
    onboarded: profile.onboardedAt !== null,
    name: profile.name,
    messages: page.messages,
    hasMore: page.hasMore,
    oldestId: page.oldestId,
    conversations: threads,
  });
}
