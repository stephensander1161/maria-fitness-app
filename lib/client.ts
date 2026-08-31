"use client";

/** Thin wrapper over /api/action — the browser's door into the tool registry. */
export async function action<T = unknown>(tool: string, input: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, input }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Action failed");
  return json.result as T;
}

export type CoachEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; status: "running" | "done" }
  | { type: "done" }
  | { type: "error"; message: string };

/** Consume the coach's SSE stream as an async iterable of events. */
export async function* streamCoach(
  body: { message: string } | { kickoff: true },
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
