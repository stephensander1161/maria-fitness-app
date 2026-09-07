"use client";

import { ALLOWANCE_WARN_PCT } from "@/lib/allowance-pct";

import type { Msg } from "@/lib/use-coach-thread";
import { RichText } from "./rich-text";

/**
 * The conversation itself — her bubbles, the coach's prose, what it is doing
 * while it does it. Shared by the Coach tab and every inline "ask about this"
 * panel, so a message looks the same wherever she is standing.
 */
export function ThreadMessages({
  messages, streaming, activity, busy, error, compact, onReplay,
}: {
  messages: Msg[];
  streaming: string;
  activity: string | null;
  busy: boolean;
  error: string | null;
  compact?: boolean;
  /** Send one of her earlier messages again — after an error, or because the
   *  answer was worth a second try. Given by every surface that can send. */
  onReplay?: (text: string) => void;
}) {
  const size = compact ? "text-[14px]" : "text-[15px]";
  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="group flex items-end justify-end gap-1.5">
            {onReplay && (
              <button
                type="button"
                onClick={() => onReplay(m.text)}
                disabled={busy}
                aria-label="Send this again"
                title="Send this again"
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
  if (items.length === 0) return null;
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
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
