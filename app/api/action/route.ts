import { runTool } from "@/lib/tools";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";

/**
 * The fast-log surfaces call tools directly — same registry, same handlers, no
 * model in the loop. A tap on a set stepper and the coach saying "log that set"
 * end up in exactly the same code path.
 */
export async function POST(req: Request) {
  const { tool, input } = (await req.json()) as { tool?: string; input?: unknown };
  if (!tool) return Response.json({ error: "tool required" }, { status: 400 });

  const profile = await getProfile();
  try {
    const result = await runTool(tool, input ?? {}, { profileId: profile.id });
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
