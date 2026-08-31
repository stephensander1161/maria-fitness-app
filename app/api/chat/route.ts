import { runCoach, type CoachEvent } from "@/lib/agent/loop";
import { getProfile } from "@/lib/profile";
import { checkChatAllowed, LIMITS } from "@/lib/limits";

export const runtime = "nodejs";
// Hobby tier caps function duration at 60s. A coaching turn with tool calls
// lands well inside that; the stream keeps the connection alive meanwhile.
export const maxDuration = 60;

/**
 * Server-sent events. The API key never leaves this process — the browser only
 * ever sees text deltas and tool-progress labels.
 */
export async function POST(req: Request) {
  const { message, silent } = (await req.json().catch(() => ({}))) as {
    message?: string;
    silent?: boolean;
  };
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > LIMITS.maxMessageChars) {
    return Response.json({ error: "That message is too long." }, { status: 413 });
  }

  // Rate and spend ceiling, checked before a single token is bought.
  const gate = await checkChatAllowed();
  if (!gate.allowed) {
    return Response.json({ error: gate.reason }, { status: 429 });
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
