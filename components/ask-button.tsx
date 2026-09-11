"use client";

/**
 * The coach, from the top of any screen.
 *
 * The companion at the bottom of the page has been the only way to open the
 * chat since the floating bubble was retired — and on a long screen that means
 * scrolling past everything to ask a question about the thing she is looking
 * at, which is the moment the question occurs to her.
 *
 * This is not that bubble coming back. The retired one floated over the page
 * content; this lives in the chrome at the top, where a "talk to it" control
 * is looked for, and it scrolls away with nothing because it is sticky rather
 * than fixed over the top of anything.
 *
 * It dispatches the same event the companion does — one sheet, one
 * conversation, mounted once in the root layout.
 */
export function AskButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("coach:open"))}
      aria-label="Ask your coach"
      title="Ask your coach"
      className={`grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface/90 text-muted backdrop-blur transition-colors hover:text-accent active:bg-raised ${className}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a10 10 0 0 1-2.6-.34L4 21l1.2-3.6A7.5 7.5 0 0 1 3 11c0-4.42 4.03-8 9-8Z" />
      </svg>
    </button>
  );
}
