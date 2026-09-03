"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCoachThread } from "@/lib/use-coach-thread";
import { useDialog } from "@/lib/use-dialog";
import { Composer, ThreadMessages } from "./coach-thread";
import { TranscriptDownload } from "./transcript-export";

/**
 * The coach, in the corner of the screen she is on.
 *
 * Two buttons that open the same sheet, because there are two things people
 * want from a coach and only one of them was on offer. "Coach's read" asks it
 * to look at the screen and say something; the speech bubble beside it opens
 * the same sheet with the cursor in the box, for someone who does not want an
 * opinion — they want to say "log four sets of V-ups" and get on with it.
 * Waiting through a paragraph first is a tax on the more common request.
 *
 * The page's data is assembled on the server from the request, so the browser
 * never authors what the coach is told. Both modes carry it: the read has it
 * because it was asked about this screen, and the ask has it because a
 * question typed on the Eat screen is a question about today's food.
 *
 * This replaced a floating bubble on every screen. Two coach entry points on
 * one page is one too many, and the bubble was the one that knew less.
 */
export function AiOpinion({ page, label }: { page: "train" | "plan" | "progress"; label: string }) {
  const [open, setOpen] = useState<"read" | "ask" | null>(null);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => setOpen("read")}
          className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-accent transition-colors hover:bg-raised active:bg-raised"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          Coach&apos;s read
        </button>
        <button
          onClick={() => setOpen("ask")}
          aria-label="Ask your coach"
          className="grid size-8 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-raised hover:text-accent active:bg-raised"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
          </svg>
        </button>
      </div>
      {open && <Sheet page={page} label={label} mode={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * "Ask the coach about this" — where "this" is something on the screen the
 * header buttons cannot see.
 *
 * The page context tells the coach what screen she is on; it does not know
 * she has just looked up sirloin steak in the calculator and found nothing to
 * cook with it. This carries that one sentence in with her, so the answer
 * starts from the thing she is actually looking at rather than from "what
 * were you asking about?".
 *
 * It sends on tap, on purpose. The button says it will ask, and making her
 * confirm a question she has just chosen to ask is a step for nothing.
 */
export function AskAbout({ prompt, label = "this", children }: {
  prompt: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft/70"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
        </svg>
        {children}
      </button>
      {open && (
        <Sheet page="plan" label={label} mode="ask" ask={prompt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function Sheet({
  page, label, mode, ask, onClose,
}: {
  page: "train" | "plan" | "progress";
  label: string;
  mode: "read" | "ask";
  /** A question to send the moment it opens, from AskAbout. */
  ask?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const path = usePathname();
  const {
    messages, streaming, activity, busy, error, input, setInput, stream, send,
  } = useCoachThread({ onTurnEnd: ({ usedTools }) => { if (usedTools) router.refresh(); } });
  const [opened, setOpened] = useState(mode === "ask" && !ask);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  // A question that came with the button, sent once. The ref guards a second
  // send if this ever re-renders before the stream settles.
  useEffect(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    void send(ask, path).then(() => setOpened(true));
  }, [ask, send, path]);

  useEffect(() => {
    if (mode !== "read") return;
    // A subscription to a stream, with cleanup — which is what effects are for.
    // Closing the sheet mid-answer aborts the request rather than leaving it
    // running and writing into a component that is gone.
    const controller = new AbortController();
    let live = true;
    void stream({ opinion: page }, { signal: controller.signal })
      .then(() => { if (live) setOpened(true); });
    return () => { live = false; controller.abort(); };
  }, [mode, page, stream]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, streaming, activity]);
  const panel = useDialog(onClose);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={`The coach on your ${label}`}
      className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-6 bg-ink/70 backdrop-blur-sm">
      <div ref={panel} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-line md:rounded-2xl md:border md:shadow-2xl md:shadow-ink/60 bg-surface"
        // This sheet scrolls inside itself, so the page-level pull gesture
        // must leave it alone.
        data-no-pull-to-refresh=""
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}>
        <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-semibold">
            {mode === "read" ? `On your ${label}` : "Your coach"}
          </h2>
          <div className="flex items-center gap-1">
            {/* The transcript, where the transcript is. It was a card on the
                settings screen with its own heading, a paragraph and four
                range buttons, for something anyone wanting it is already
                looking at. */}
            <TranscriptDownload />
            <button onClick={onClose} className="-my-2 px-2 py-2 text-[13px] text-muted">Close</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {messages.length === 0 && !streaming && !error ? (
            mode === "ask" ? (
              // A clean box, not an empty room. It already knows what screen
              // she came from, so say so rather than making her repeat it.
              <p className="py-8 text-center text-[13px] leading-relaxed text-faint">
                Ask for anything, or tell it what to log.
                <br />
                It can see {label}.
              </p>
            ) : (
              <div className="flex justify-center gap-1.5 py-10">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                    style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )
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
            // The path, not the contents: the server reads the screen. Same
            // rule as everywhere else — the client never authors context.
            onSubmit={(text) => send(text, path)}
            busy={busy || !opened}
            placeholder={mode === "ask" ? "Ask, or tell it what to log…" : "Say something back…"}
          />
        </div>
      </div>
    </div>
  );
}
