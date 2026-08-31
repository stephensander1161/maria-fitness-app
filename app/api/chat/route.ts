import { runCoach, type CoachEvent } from "@/lib/agent/loop";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Server-sent events. The API key never leaves this process — the browser only
 * ever sees text deltas and tool-progress labels.
 */
export async function POST(req: Request) {
  const { message, silent } = (await req.json()) as { message?: string; silent?: boolean };
  if (!message?.trim()) {
    return Response.json({ error: "Message required" }, { status: 400 });
  }

  const profile = await getProfile();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CoachEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runCoach(profile, message, { silent })) send(event);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Coach failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
