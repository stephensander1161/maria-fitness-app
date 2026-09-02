"use client";

/**
 * Why an action failed. `status` is null when the request never reached the
 * server at all — offline, DNS, a dropped connection in a gym basement. That
 * case and a 5xx are the only ones worth retrying later; a 4xx is a real
 * rejection and replaying it would just fail again.
 */
export class ActionError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ActionError";
    this.status = status;
  }

  get isNetworkFailure() {
    return this.status === null;
  }

  /** Safe to queue and send again once the signal is back. */
  get retriable() {
    return this.status === null || this.status >= 500;
  }
}

/** Thin wrapper over /api/action — the browser's door into the tool registry. */
export async function action<T = unknown>(tool: string, input: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, input }),
    });
  } catch {
    // fetch only rejects when the request never completed — that is the
    // signal-dropped case, and the one the offline queue exists for.
    throw new ActionError("No connection", null);
  }

  // A gateway or a login redirect can answer with something that isn't JSON;
  // treat that as a failure carrying the real status rather than throwing raw.
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; result?: unknown }
    | null;

  if (!res.ok || !json?.ok) throw new ActionError(json?.error ?? "Action failed", res.status);
  return json.result as T;
}

export type CoachEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "done" }
  | { type: "error"; message: string };

/** Consume the coach's SSE stream as an async iterable of events. */
export async function* streamCoach(
  body:
    | { message: string; page?: string }
    | { kickoff: true }
    | { opinion: "train" | "plan" | "progress" },
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<CoachEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as CoachEvent;
    }
  }
}

/**
 * What to show her when an action fails.
 *
 * Five screens used to swallow this entirely: she tapped save, nothing
 * happened, and nothing said why. A tool's own error is usually the most
 * useful thing available — "No such entry", "Nothing in the library matches" —
 * so it is preferred over a generic line, and only the network case gets
 * rewritten, because "Failed to fetch" means nothing to her.
 */
export function actionMessage(
  err: unknown,
  fallback = "That didn't save — try again.",
): string {
  if (err instanceof ActionError) {
    if (err.isNetworkFailure) return "No connection — that didn't save. Try again when you're back online.";
    if (err.message && err.message !== "Action failed") return err.message;
  }
  return fallback;
}
