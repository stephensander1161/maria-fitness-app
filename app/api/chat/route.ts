import { runCoach, type CoachEvent } from "@/lib/agent/loop";
import { getProfile } from "@/lib/profile";
import { currentUser } from "@/lib/session";
import { checkChatAllowed, LIMITS } from "@/lib/limits";
import { hasHistory } from "@/lib/agent/history";
import { audit } from "@/lib/audit";
import {
  buildPageContext, contextForPath, OPINION_PROMPT, type OpinionPage,
} from "@/lib/page-context";

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
  const { message, kickoff, opinion, page } = (await req.json().catch(() => ({}))) as {
    message?: string;
    kickoff?: boolean;
    opinion?: OpinionPage;
    /** The path she is on. Names a screen; never carries its contents. */
    page?: string;
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
  /** Kept out of the transcript when it differs from what she typed. */
  let save: string | undefined;

  if (kickoff === true) {
    if (await hasHistory(profile.id)) {
      return Response.json({ error: "Already started" }, { status: 409 });
    }
    text = OPENING_PROMPT;
    silent = true;
  } else if (opinion) {
    if (!["train", "plan", "progress"].includes(opinion)) {
      return Response.json({ error: "Unknown page" }, { status: 400 });
    }
    // The screen's contents are read from the database here, not accepted from
    // the browser — same rule as the opening greeting. Handing the coach the
    // data directly also saves several tool round trips for a question that is
    // explicitly about what is already on screen.
    text = `[She tapped "Get my coach's read" on this screen.]\n\n${
      await buildPageContext(profile.id, opinion)
    }\n\n${OPINION_PROMPT[opinion]}`;
    silent = true;
  } else {
    if (typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }
    if (message.length > LIMITS.maxMessageChars) {
      return Response.json({ error: "That message is too long." }, { status: 413 });
    }
    text = message;

    // She is asking from a screen, so hand the coach that screen. The browser
    // says *which* page; this reads what is on it — the same rule as the
    // opening greeting, and the reason a client cannot author what the model
    // is told. Sent once per screen, not on every message.
    if (typeof page === "string" && page.length < 200) {
      const seen = await contextForPath(profile.id, page);
      if (seen) {
        save = message;
        text = [
          `[She is looking at ${seen.label}. What that screen shows right now:]`,
          seen.context,
          ``,
          `[Her message:]`,
          message,
        ].join("\n");
      }
    }
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
        for await (const event of runCoach(profile, text, { silent, save, speakingTo: user.name })) send(event);
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
