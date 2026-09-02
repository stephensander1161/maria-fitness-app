"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoachThread } from "@/lib/use-coach-thread";
import { useEscape } from "@/lib/use-escape";
import { Composer, ThreadMessages } from "./coach-thread";

/**
 * "Get my coach's read" — the coach's take on whatever screen she is on.
 *
 * The page's data is assembled on the server from the request, so the browser
 * never authors what the coach is told. It streams into a sheet rather than
 * navigating to the chat, because the point is to read it against the numbers
 * she is already looking at — and she can answer it right there, in the same
 * conversation she would find on the Coach tab.
 */
export function AiOpinion({ page, label }: { page: "train" | "plan" | "progress"; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-accent active:bg-raised"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
        Coach&apos;s read
      </button>
      {open && <Sheet page={page} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({
  page, label, onClose,
}: { page: "train" | "plan" | "progress"; label: string; onClose: () => void }) {
  const router = useRouter();
  const {
    messages, streaming, activity, busy, error, input, setInput, stream, send,
  } = useCoachThread({ onTurnEnd: ({ usedTools }) => { if (usedTools) router.refresh(); } });
  const [opened, setOpened] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A subscription to a stream, with cleanup — which is what effects are for.
    // Closing the sheet mid-answer aborts the request rather than leaving it
    // running and writing into a component that is gone.
    const controller = new AbortController();
    let live = true;
    void stream({ opinion: page }, { signal: controller.signal })
      .then(() => { if (live) setOpened(true); });
    return () => { live = false; controller.abort(); };
  }, [page, stream]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, streaming, activity]);

  useEscape(onClose);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={`The coach on your ${label}`}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/70 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-line bg-surface"
        // This sheet scrolls inside itself, so the page-level pull gesture
        // must leave it alone.
        data-no-pull-to-refresh=""
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}>
        <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-semibold">On your {label}</h2>
          <button onClick={onClose} className="-my-2 px-2 py-2 text-[13px] text-muted">Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {messages.length === 0 && !streaming && !error ? (
            <div className="flex justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                  style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          ) : (
            <ThreadMessages
              messages={messages}
              streaming={streaming}
              activity={activity}
              busy={busy && messages.length > 0}
              error={error}
            />
          )}
          <div ref={end} className="h-2" />
        </div>

        {/* Answer it here. It used to say "carry on with it on the Coach tab",
            which meant losing the numbers the answer was about. */}
        <div className="px-5 pt-3">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={send}
            busy={busy || !opened}
            placeholder="Say something back…"
          />
        </div>
      </div>
    </div>
  );
}
