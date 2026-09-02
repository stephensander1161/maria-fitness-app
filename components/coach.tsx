"use client";

import { useEffect, useRef, useState } from "react";
import { useCoachThread, type Msg } from "@/lib/use-coach-thread";
import { Composer, ThreadMessages } from "./coach-thread";
import { Boost } from "./boost";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";

export function Coach({ initialName }: { initialName: string | null }) {
  const {
    messages, setMessages, streaming, activity, busy, error, input, setInput, stream, send,
  } = useCoachThread();
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const kicked = useRef(false);

  // Block body on purpose: an expression-bodied arrow hands its value back to
  // React as the effect's cleanup, and React then tries to call it.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, activity]);

  // Load the transcript, and if there isn't one, let the coach open the
  // conversation itself — this app greets her, it doesn't wait to be prompted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages.map((m: Msg) => ({ id: m.id, role: m.role, text: m.text })));
        if (data.messages.length === 0 && !kicked.current) {
          kicked.current = true;
          void stream({ kickoff: true });
        }
      } catch {
        // This is the front door, and it used to fail in total silence: the
        // fetch rejected, nothing was caught, and she got "Hey, Maria" over an
        // empty screen with her history apparently gone. Say so instead.
        if (cancelled) return;
        setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setMessages, stream, reloadKey]);

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {initialName ? `Hey, ${initialName}` : "Coach"}
        </h1>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-faint">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <button
            onClick={() => setFeedback(true)}
            aria-label="Send feedback"
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted active:bg-raised"
          >
            <FeedbackGlyph />
          </button>
          <button
            onClick={() => setBoosting(true)}
            aria-label="Give me a boost"
            className="grid size-9 place-items-center rounded-full border border-line bg-surface text-accent active:bg-raised"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
            </svg>
          </button>
        </div>
      </header>

      {boosting && <Boost onClose={() => setBoosting(false)} />}
      {feedback && <FeedbackSheet path="/" onClose={() => setFeedback(false)} />}

      <div className="flex-1">
        <ThreadMessages
          messages={messages}
          streaming={streaming}
          activity={activity}
          busy={busy}
          error={error}
        />

        {loadFailed && (
          <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] text-muted">
            <p>Couldn&rsquo;t load your conversation — you may be offline.</p>
            <button
              onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-[13px] text-accent"
            >
              Try again
            </button>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* Keeps the last message and the openers clear of the fixed composer. */}
      <div className="h-16" aria-hidden="true" />

      {/*
        A fixed bar with a solid ground of its own, like any messaging app. It
        used to be sticky with no backdrop, so the conversation showed through
        it and the send button sat on top of whatever bubble was underneath.
        `bottom` is the tab bar's height plus the safe area it pads itself with.
      */}
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={send}
        busy={busy}
        className="fixed inset-x-0 z-40 border-t border-line/60 bg-base/95 backdrop-blur-xl"
        innerClassName="mx-auto flex max-w-lg gap-2 px-4 py-2.5"
        style={{ bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0.5rem))" }}
      />
    </div>
  );
}
