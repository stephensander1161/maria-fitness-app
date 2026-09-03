"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useCoachThread, type Msg } from "@/lib/use-coach-thread";
import { useDialog } from "@/lib/use-dialog";
import { Composer, ThreadMessages } from "./coach-thread";
import { Boost } from "./boost";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";

/**
 * The coach, on every screen, knowing which one she is on.
 *
 * It used to be a tab: to ask about the set she was looking at she had to
 * leave the set, arrive at a chat that knew nothing about it, and describe it
 * from memory. Now it opens over whatever she is doing and the server attaches
 * that screen's contents to her first message from it — the browser names the
 * page, the server reads what is on it, so the client can never put words in
 * the app's mouth.
 *
 * The thread is a real scroll container with the composer *outside* it. The
 * tab version grew the page instead, so the newest message sat under the fixed
 * composer and she had to scroll down to read what had just been said.
 */
const HIDE_ON = ["/login", "/welcome"];

export function CoachBubble({ name }: { name: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (HIDE_ON.includes(path)) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask your coach"
          className="fixed right-4 z-50 grid size-14 place-items-center rounded-full bg-accent text-ink shadow-lg shadow-ink/50 transition-transform hover:scale-105 active:scale-95 md:bottom-8 md:right-8"
          // Above the tab bar on a phone; the tab bar is gone on a desktop, so
          // the inline style is overridden by the md: classes above.
          style={{ bottom: "calc(4.25rem + max(env(safe-area-inset-bottom), 0.5rem))" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
          </svg>
        </button>
      )}
      {open && <CoachSheet name={name} path={path} onClose={() => setOpen(false)} />}
    </>
  );
}

function CoachSheet({
  name, path, onClose,
}: { name: string | null; path: string; onClose: () => void }) {
  const router = useRouter();
  const {
    messages, setMessages, streaming, activity, busy, error, input, setInput, stream, send,
  } = useCoachThread({
    // A turn that ran tools changed something the screen behind this is
    // showing — "log that set" should tick the set off underneath.
    onTurnEnd: ({ usedTools }) => { if (usedTools) router.refresh(); },
  });
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const kicked = useRef(false);
  const panel = useDialog(onClose);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, activity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setMessages(data.messages.map((m: Msg) => ({ id: m.id, role: m.role, text: m.text })));
        setLoaded(true);
        if (data.messages.length === 0 && !kicked.current) {
          kicked.current = true;
          void stream({ kickoff: true });
        }
      } catch {
        // This used to fail in total silence: the fetch rejected, nothing was
        // caught, and she got an empty screen with her history apparently gone.
        if (cancelled) return;
        setLoaded(true);
        setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setMessages, stream, reloadKey]);

  /**
   * Her message, with the screen she sent it from — every time, not just the
   * first. Sending it once meant "why is the bench slipping?" was answered
   * from the progression list and the follow-up "and the squat?" had nothing
   * to answer from, so the coach either guessed or re-ran the tools.
   */
  const say = (text: string) => send(text, path);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your coach"
      className="fixed inset-0 z-[80] flex flex-col justify-end bg-ink/70 backdrop-blur-sm md:items-end md:justify-center md:p-6"
    >
      {/*
        A sheet from the bottom edge is right under a thumb and wrong under a
        mouse — on a wide screen it becomes a panel docked to the right, at a
        height that leaves the screen behind it visible, because the whole
        point is asking about what is on it.
      */}
      <div
        ref={panel}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88dvh] w-full max-w-lg flex-col self-center rounded-t-3xl border-t border-line bg-base md:h-[min(46rem,88dvh)] md:self-auto md:rounded-2xl md:border md:shadow-2xl md:shadow-ink/60"
        data-no-pull-to-refresh=""
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
          <h2 className="truncate text-[17px] font-semibold">
            {name ? `Hey, ${name}` : "Coach"}
          </h2>
          <div className="flex items-center gap-2">
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
            <button onClick={onClose} aria-label="Close"
              className="grid size-9 place-items-center rounded-full border border-line bg-surface text-muted active:bg-raised">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        {/* The scroll container. The composer sits outside it, which is the
            whole reason the last message is never hidden underneath. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!loaded && !loadFailed && messages.length === 0 && !busy && (
            // Without this the sheet opened to a header, nothing, and a text
            // box — which reads as the whole conversation having gone.
            <div className="flex justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                  style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
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
          <div ref={bottom} className="h-1" />
        </div>

        <div
          className="shrink-0 border-t border-line/60 px-4 pt-2.5"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
        >
          <Composer value={input} onChange={setInput} onSubmit={say} busy={busy} autoFocus />
        </div>
      </div>

      {boosting && <Boost onClose={() => setBoosting(false)} />}
      {feedback && <FeedbackSheet path={path} onClose={() => setFeedback(false)} />}
    </div>
  );
}
