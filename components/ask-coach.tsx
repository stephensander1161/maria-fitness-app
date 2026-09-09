"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCoachThread } from "@/lib/use-coach-thread";
import { AllowanceNote, Composer, Suggestions, ThreadMessages } from "./coach-thread";

/**
 * Talk to the coach without leaving the screen you are on.
 *
 * Every "ask your coach about this" used to be a link to the Coach tab: she
 * lost the page she was reading, arrived at a chat with no idea what she had
 * been about to ask, and typed the name of the movement back in. The
 * conversation is the same one either way — this posts to the same transcript,
 * so it is on the Coach tab afterwards — but it happens next to the thing she
 * is asking about.
 *
 * A turn that called tools changed something this screen is showing, so the
 * screen is reloaded when one does.
 */
export function AskCoach({
  title,
  hint,
  suggestions = [],
  placeholder,
  refreshOnChange = true,
}: {
  title: string;
  hint?: string;
  suggestions?: string[];
  placeholder?: string;
  refreshOnChange?: boolean;
}) {
  const router = useRouter();
  const thread = useCoachThread({
    onTurnEnd: ({ usedTools }) => { if (usedTools && refreshOnChange) router.refresh(); },
  });
  const { messages, streaming, activity, busy, error, errorCode, input, setInput, send, allowance } = thread;
  const panel = useRef<HTMLElement>(null);

  // Follow the answer as it comes in, but only once there is a conversation —
  // scrolling an untouched panel into view on page load would yank the page.
  const end = useRef<HTMLDivElement>(null);
  const started = messages.length > 0 || streaming.length > 0 || busy;
  useEffect(() => {
    if (started) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [started, messages, streaming, activity]);

  return (
    // `data-ask-coach` marks a coach entry that lives in the page's own flow,
    // next to the thing it is about, rather than in the sheet over it.
    <section ref={panel} className="card mb-3 p-4" data-ask-coach="" data-no-pull-to-refresh="">
      {/* The hint carried `shrink-0` and the heading did not, so on a phone a
          sentence-long hint took the whole row and "Ask about your friends"
          was squeezed into a four-line column one word wide. The heading is
          short and fixed; the hint is the long part, so the hint is the part
          that gives way — and below `sm` it takes its own line rather than
          competing for that one at all. */}
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="text-[14px] font-semibold sm:shrink-0">{title}</h2>
        {hint && <span className="min-w-0 text-[11px] leading-snug text-faint sm:text-right">{hint}</span>}
      </div>

      {started && (
        <div className="mb-3">
          <ThreadMessages
            messages={messages}
            streaming={streaming}
            activity={activity}
            busy={busy}
            error={error}
            errorCode={errorCode}
            compact
            onReplay={send}
          />
          <div ref={end} />
        </div>
      )}

      {!busy && <Suggestions items={suggestions} onPick={send} busy={busy} />}

      <AllowanceNote leftPct={allowance} />
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={send}
        busy={busy}
        placeholder={placeholder}
        className="mt-2"
      />
    </section>
  );
}
