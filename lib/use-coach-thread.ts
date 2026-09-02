"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamCoach, type CoachEvent } from "@/lib/client";
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
  const [input, setInput] = useState("");
  // Held in a ref so a caller can pass an inline arrow without re-creating
  // `stream` on every render — an effect that streams would run twice. Written
  // in an effect, not during render, because a render can be thrown away.
  const onTurnEnd = useRef(opts.onTurnEnd);
  useEffect(() => { onTurnEnd.current = opts.onTurnEnd; });

  /**
   * Consume one turn. Returns whether anything was actually delivered — a
   * failure with no text at all is the case where her message never landed.
   */
  const stream = useCallback(async (body: Body, opts: { signal?: AbortSignal } = {}) => {
    setBusy(true);
    setError(null);
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
        } else if (e.type === "error") { setError(e.message); failed = true; }
      }
    } catch (err) {
      if (opts.signal?.aborted) return false;
      setError(err instanceof Error ? err.message : "Connection lost");
      failed = true;
    }

    if (acc.trim()) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: acc }]);
    }
    setStreaming("");
    setActivity(null);
    setBusy(false);
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

  return {
    messages, setMessages, streaming, activity, busy, error, setError,
    input, setInput, stream, send,
  };
}
