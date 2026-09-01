import { runCoach, type CoachEvent } from "@/lib/agent/loop";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";
import { checkChatAllowed, LIMITS } from "@/lib/limits";
import { hasHistory } from "@/lib/agent/history";
import { audit } from "@/lib/audit";

/** Server-authored, so the browser can never put words in the system's mouth. */
const OPENING_PROMPT =
  "[The app has just been opened for the very first time. Introduce yourself briefly and warmly, then begin onboarding by asking what she is hoping to change and why it matters to her. Do not ask for numbers yet.]";

export const runtime = "nodejs";
// Hobby tier caps function duration at 60s. A coaching turn with tool calls
// lands well inside that; the stream keeps the connection alive meanwhile.
export const maxDuration = 60;

/**
 * Server-sent events. The API key never leaves this process — the browser only
 * ever sees text deltas and tool-progress labels.
 */
export async function POST(req: Request) {
  const { message, kickoff } = (await req.json().catch(() => ({}))) as {
    message?: string;
    kickoff?: boolean;
  };

  // Middleware proved the token; this proves the account is still valid.
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getProfile(user.id);

  // The first-run greeting is composed here, not sent by the browser. Letting
  // the client supply text that is hidden from the transcript would hand it a
  // channel for forging system-style instructions to the model.
  let text: string;
  let silent = false;

  if (kickoff === true) {
    if (await hasHistory(profile.id)) {
      return Response.json({ error: "Already started" }, { status: 409 });
    }
    text = OPENING_PROMPT;
    silent = true;
  } else {
    if (typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }
    if (message.length > LIMITS.maxMessageChars) {
      return Response.json({ error: "That message is too long." }, { status: 413 });
    }
    text = message;
  }

  // Rate and spend ceiling, checked before a single token is bought.
  const gate = await checkChatAllowed(profile.id);
  if (!gate.allowed) {
    await audit("spend.ceiling_reached", { req, detail: { reason: gate.reason } });
    return Response.json({ error: gate.reason }, { status: 429 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CoachEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runCoach(profile, text, { silent })) send(event);
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
