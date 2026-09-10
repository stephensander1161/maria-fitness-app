import type { CoachEvent } from "./loop";

/**
 * Where a turn's events go while anybody is still listening.
 *
 * `write` is allowed to throw, and that is the whole point of this module —
 * see `relay`.
 */
export type Sink = {
  write(event: CoachEvent): void;
  close(): void;
};

/**
 * Run a turn to the end, whether or not she is still on the other end of it.
 *
 * Switching apps on a phone suspends the tab and the socket goes with it.
 * That cannot be prevented from JavaScript: no keep-alive, heartbeat or
 * worker holds a backgrounded tab's connection open, and anything claiming to
 * is just a slower way to lose it.
 *
 * What *was* avoidable is what a dropped socket did to the turn. Events went
 * straight into `controller.enqueue`, enqueueing into a cancelled stream
 * throws, and that threw out of the `for await` — which returns the generator
 * and abandons the coach mid-loop. A turn interrupted between running a tool
 * and reporting it had already written the row and would now never say so.
 * "Backgrounding it kills the connection" was really "backgrounding it kills
 * the turn", and only the second half was the app's fault.
 *
 * So a dead sink stops the *writing*, not the work: the loop is drained
 * either way, the answer is saved to the transcript by `runCoach`, and the
 * browser can go and read it when she comes back.
 */
export async function relay(events: AsyncIterable<CoachEvent>, sink: Sink): Promise<void> {
  let listening = true;
  const write = (event: CoachEvent) => {
    if (!listening) return;
    try {
      sink.write(event);
    } catch {
      listening = false;
    }
  };

  try {
    for await (const event of events) write(event);
  } catch (err) {
    // One attempt at telling her; if the sink is gone this is a no-op, and
    // `runCoach` has already put the failure in app_errors either way.
    write({ type: "error", message: err instanceof Error ? err.message : "Coach failed" });
  } finally {
    listening = false;
    try {
      sink.close();
    } catch {
      // Already closed by the disconnect that got us here.
    }
  }
}

/**
 * The answer to a turn whose connection died, found again in the transcript.
 *
 * Matched on her own words rather than a message id: an id in the browser's
 * thread was minted there and the transcript has never seen it, and an inline
 * thread holds only part of the conversation. Her last message is a fixed
 * point in both.
 *
 * The *last* time she said it, not the first — she may have asked the same
 * thing twice, and it is the newest turn that is missing its answer.
 */
export function answerAfter<T extends { role: string; text: string }>(
  messages: readonly T[],
  said: string,
): T[] {
  const wanted = said.trim();
  if (!wanted) return [];
  let at = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.text.trim() === wanted) { at = i; break; }
  }
  if (at < 0) return [];
  return messages.slice(at + 1).filter((m) => m.role === "assistant" && m.text.trim().length > 0);
}
