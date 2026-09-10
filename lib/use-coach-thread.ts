"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { action, CoachError, streamCoach, type CoachEvent } from "@/lib/client";
import { TOOL_LABELS } from "@/lib/tool-labels";

export type Msg = { id: string; role: "user" | "assistant"; text: string };

/** What the chat route accepts. The browser never authors a silent turn. */
type Body = Parameters<typeof streamCoach>[0];

/**
 * One coach conversation, wherever it is being shown.
 *
 * The Coach tab, the sheet on the learn page, the panel under an empty plan —
 * all of them talk to the same transcript through /api/chat, so this holds the
 * streaming state once rather than three times slightly differently. Anything
 * she says here is in the conversation she finds on the Coach tab.
 */
export function useCoachThread(
  opts: { onTurnEnd?: (info: { usedTools: boolean; delivered: boolean }) => void } = {},
) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Why it failed, when there is something she can do about it. */
  const [errorCode, setErrorCode] = useState<"spent" | "rate" | "messages" | null>(null);
  const [input, setInput] = useState("");
  /** Percent of today's allowance left, once a turn has told us. Null until then. */
  const [allowance, setAllowance] = useState<number | null>(null);
  // Held in a ref so a caller can pass an inline arrow without re-creating
  // `stream` on every render — an effect that streams would run twice. Written
  // in an effect, not during render, because a render can be thrown away.
  const onTurnEnd = useRef(opts.onTurnEnd);
  useEffect(() => { onTurnEnd.current = opts.onTurnEnd; });

  /**
   * Consume one turn. Returns whether anything was actually delivered — a
   * failure with no text at all is the case where her message never landed.
   */
  /**
   * The turn in flight, so she can stop it.
   *
   * Held in a ref rather than state: aborting must not wait for a render, and
   * nothing renders differently because a controller exists — `busy` already
   * says a turn is running.
   */
  const inFlight = useRef<AbortController | null>(null);

  const stream = useCallback(async (body: Body, opts: { signal?: AbortSignal } = {}) => {
    setBusy(true);
    // A caller's own signal still wins; this one is hers.
    const mine = new AbortController();
    inFlight.current = mine;
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, mine.signal])
      : mine.signal;
    opts = { ...opts, signal };
    // The companion at the bottom of the page stops and thinks while this
    // runs. Broadcast rather than shared state: he is in the layout and this
    // hook is in three different sheets.
    window.dispatchEvent(new CustomEvent("coach:busy"));
    setError(null);
    setErrorCode(null);
    let acc = "";
    let failed = false;
    let usedTools = false;
    let accepted = false;
    try {
      for await (const event of streamCoach(body, opts)) {
        const e: CoachEvent = event;
        if (e.type === "accepted") { accepted = true; }
        else if (e.type === "text") { acc += e.text; setStreaming(acc); setActivity(null); }
        else if (e.type === "tool") {
          if (e.status === "running") usedTools = true;
          setActivity(e.status === "running" ? TOOL_LABELS[e.name] ?? "working" : null);
        } else if (e.type === "allowance") { setAllowance(e.leftPct); }
        else if (e.type === "error") { setError(e.message); setErrorCode(e.code ?? null); failed = true; }
      }
    } catch (err) {
      if (opts.signal?.aborted) return false;
      setError(err instanceof Error ? err.message : "Connection lost");
      // The spend cap answers with JSON before the stream opens, so the code
      // arrives on the thrown error rather than as an event.
      setErrorCode(err instanceof CoachError ? err.code ?? null : null);
      failed = true;
    }

    if (acc.trim()) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: acc }]);
    }
    setStreaming("");
    setActivity(null);
    setBusy(false);
    window.dispatchEvent(new CustomEvent("coach:idle"));
    // "Delivered" now means the server has it, not that it answered. A turn
    // that failed mid-stream is still in her transcript, and putting her words
    // back in the box would have her send them twice.
    const delivered = accepted || acc.trim().length > 0 || !failed;
    // A turn that called tools has changed something the surrounding screen is
    // showing — the caller decides whether that means reloading it.
    onTurnEnd.current?.({ usedTools, delivered });
    return delivered;
  }, []);

  const send = useCallback(
    async (text: string, page?: string) => {
      const said = text.trim();
      if (!said) return;
      setInput("");
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: said }]);

      // `page` is a path, not content: the server reads what that screen shows.
      const delivered = await stream(page ? { message: said, page } : { message: said });
      if (!delivered) {
        // Nothing came back at all, so the server never heard it. Put her words
        // back in the box rather than making her remember what she typed —
        // this is the gym-with-bad-signal case the whole app is built around.
        setMessages((m) => m.slice(0, -1));
        setInput((current) => current || said);
      }
    },
    [stream],
  );

  /**
   * Say one of her earlier messages again, from that point in the thread.
   *
   * Appending it left the same question in the transcript twice with two
   * answers under it, and every replay after that made the thread longer and
   * harder to read. So the conversation is rewound to just before it — on the
   * screen and in the database, because what the model is sent next turn has
   * to match what she is looking at.
   *
   * The rewind is best-effort by design. A message from this session has a
   * client id the transcript has never seen, so the tool finds nothing and
   * says so; the thread on screen is still truncated, which is the half she
   * asked for. It resolves fully the moment the sheet reloads its history.
   */
  const replay = useCallback(
    async (m: Msg, page?: string) => {
      const at = messages.findIndex((x) => x.id === m.id);
      if (at >= 0) setMessages((all) => all.slice(0, at));
      await action("rewind_conversation", { messageId: m.id }).catch(() => { /* see above */ });
      await send(m.text, page);
    },
    [messages, send],
  );

  /**
   * Stop the turn she is waiting on.
   *
   * What has already streamed is kept — she has read it, and throwing away a
   * half-answer she stopped *because* it was enough is the wrong way round.
   * The server may still finish and save its own copy; the next time the sheet
   * loads its history that is what she sees, which is the honest record of
   * what was actually said.
   */
  const stop = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setBusy(false);
    setActivity(null);
    window.dispatchEvent(new CustomEvent("coach:idle"));
  }, []);

  return {
    messages, setMessages, streaming, activity, busy, error, setError, errorCode,
    input, setInput, stream, send, replay, stop, allowance,
  };
}
