import { runTool } from "@/lib/tools";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * The fast-log surfaces call tools directly — same registry, same handlers, no
 * model in the loop. A tap on a set stepper and the coach saying "log that set"
 * end up in exactly the same code path.
 */
export async function POST(req: Request) {
  const { tool, input } = (await req.json().catch(() => ({}))) as {
    tool?: string;
    input?: unknown;
  };
  if (typeof tool !== "string") {
    return Response.json({ error: "tool required" }, { status: 400 });
  }

  // Middleware proved the token; this proves the account is still valid.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);
  try {
    const result = await runTool(tool, input ?? {}, { profileId: profile.id });
    return Response.json({ ok: true, result });
  } catch (err) {
    // Log server-side; return nothing specific. Database errors and stack
    // traces are reconnaissance, not user-facing information.
    console.error("[action]", tool, err);
    return Response.json({ ok: false, error: "That didn't work." }, { status: 500 });
  }
}
