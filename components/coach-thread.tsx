"use client";

import { useEffect, useRef, useState } from "react";
import { ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";
import { action, actionMessage } from "@/lib/client";

import type { Msg } from "@/lib/use-coach-thread";
import { RichText } from "./rich-text";

/**
 * The conversation itself — her bubbles, the coach's prose, what it is doing
 * while it does it. Shared by the Coach tab and every inline "ask about this"
 * panel, so a message looks the same wherever she is standing.
 */
/**
 * The way out of the one refusal that has one.
 *
 * "Your coach is back tomorrow" is the app deciding, on her behalf, that her
 * evening is over — and the person who pays for the coach is in the same
 * house. So the dead end offers to ask him. It cannot grant anything: the
 * top-up that lifts a cap is the owner's command line and nothing reachable
 * from a session can touch it (lib/tools/top-up.ts).
 */
function AskForMore() {
  const [state, setState] = useState<"idle" | "asking" | "asked">("idle");
  const [said, setSaid] = useState<string | null>(null);

  if (state === "asked") {
    return <p className="mt-2 text-[13px] text-muted">{said ?? "Asked."}</p>;
  }
  return (
    // Its own line: inline after the sentence it follows, the two ran
    // together into "…all still work.( Ask for more today )".
    <button
      type="button"
      disabled={state === "asking"}
      onClick={async () => {
        setState("asking");
        try {
          const out = await action<{ message?: string }>("request_top_up", {});
          setSaid(out.message ?? "Asked.");
          setState("asked");
        } catch (err) {
          setSaid(actionMessage(err, "Couldn't send that just now."));
          setState("asked");
        }
      }}
      className="mt-2 block rounded-full border border-miss/40 px-3 py-1 text-[13px] font-medium text-miss disabled:opacity-50"
    >
      {state === "asking" ? "Asking…" : "Ask for more today"}
    </button>
  );
}

/**
 * Copy what she said, for pasting somewhere else or editing and sending again.
 *
 * Sits beside replay because they answer the two halves of "I want to say that
 * again": exactly, or with one word changed.
 */
function CopyMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be refused; the text is on screen to select.
        }
      }}
      aria-label={copied ? "Copied" : "Copy this message"}
      title={copied ? "Copied" : "Copy this message"}
      className="shrink-0 rounded-full p-1.5 text-faint transition-colors hover:text-text active:bg-raised md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

export function ThreadMessages({
  messages, streaming, activity, busy, error, errorCode, compact, onReplay, onStop,
}: {
  messages: Msg[];
  streaming: string;
  activity: string | null;
  busy: boolean;
  error: string | null;
  /** "spent" turns the dead end into an ask — see AskForMore above. */
  errorCode?: "spent" | "rate" | "messages" | null;
  compact?: boolean;
  /**
   * Send one of her earlier messages again — after an error, or because the
   * answer was worth a second try. Given by every surface that can send.
   *
   * It takes the whole message, not the text: replaying rewinds the thread to
   * that point rather than appending, so the same question does not end up in
   * the transcript twice with two answers under it, and that needs its id.
   */
  onReplay?: (m: Msg) => void;
  /** Stop the turn that is running. Only given where one can be. */
  onStop?: () => void;
}) {
  const size = compact ? "text-[14px]" : "text-[15px]";
  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="group flex items-end justify-end gap-1.5">
            <CopyMessage text={m.text} />
            {onReplay && (
              <button
                type="button"
                onClick={() => onReplay(m)}
                disabled={busy}
                aria-label="Send this again"
                title="Send this again, and forget what came after it"
                className="shrink-0 rounded-full p-1.5 text-faint transition-colors hover:text-text active:bg-raised disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
              </button>
            )}
            <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 ${size} text-on-accent`}>
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className={`max-w-[92%] ${size} text-text`}>
            <RichText>{m.text}</RichText>
          </div>
        ),
      )}

      {streaming && (
        <div className={`max-w-[92%] ${size}`}>
          <RichText>{streaming}</RichText>
        </div>
      )}

      {/* A way out of a turn that is taking too long, or that she has changed
          her mind about. Only while one is running. */}
      {busy && onStop && (
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised active:bg-raised"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="5" y="5" width="14" height="14" rx="2.5" />
          </svg>
          Stop
        </button>
      )}

      {activity && (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
          {activity}…
        </div>
      )}

      {busy && !streaming && !activity && (
        <div className="flex gap-1.5 py-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-faint"
              style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-miss/40 bg-miss-soft px-3 py-2 text-sm text-miss">
          {error}
          {errorCode === "spent" && <AskForMore />}
        </div>
      )}
    </div>
  );
}

/** The box she types in. One implementation, two placements. */
export function Composer({
  value, onChange, onSubmit, busy, placeholder, className, innerClassName, style, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  placeholder?: string;
  className?: string;
  innerClassName?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) onSubmit(value.trim()); }}
      className={className}
      style={style}
    >
      <div className={innerClassName ?? "flex gap-2"}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Tell your coach anything…"}
          aria-label="Message your coach"
          disabled={busy}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-full border border-edge bg-surface px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity disabled:opacity-30"
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </form>
  );
}

/** Tap-to-send starters, so she never faces an empty box with no idea. */
export function Suggestions({
  items, onPick, busy,
}: { items: string[]; onPick: (text: string) => void; busy: boolean }) {
  // The row scrolls sideways rather than wrapping, so on a phone a chip is cut
  // off at the card's edge on purpose — and a half-drawn button with nothing
  // to say why reads as a layout that has gone wrong. The fade says "there is
  // more this way", and it is measured rather than assumed: painting it over a
  // row that fits would dim a chip that is perfectly visible.
  const row = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <div
      ref={row}
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      style={overflows ? {
        maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)",
        WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)",
      } : undefined}
    >
      {items.map((s) => (
        <button
          key={s}
          type="button"
          disabled={busy}
          onClick={() => onPick(s)}
          className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-muted transition-colors hover:bg-raised active:bg-raised disabled:opacity-40"
        >
          {s}
        </button>
      ))}
    </div>
  );
}


/**
 * A quiet line when today's allowance is running low. Null or plenty left
 * renders nothing: the point is to be seen once, near the end, not to nag.
 */
export function AllowanceNote({ leftPct }: { leftPct: number | null }) {
  if (leftPct === null || leftPct > ALLOWANCE_WARN_PCT) return null;
  return (
    <p className="px-1 pb-1 text-[11px] text-faint">
      {leftPct === 0
        ? "Today's coach allowance is used up. Everything else keeps working, and the coach is back tomorrow."
        : `About ${leftPct}% of today's coach allowance left.`}
    </p>
  );
}
