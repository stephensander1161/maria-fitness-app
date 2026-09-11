"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number you can either tap or type.
 *
 * Steppers alone are fine for nudging a weight up 5lb and miserable for
 * entering 172 from scratch. The centre is a real input, so both work — and
 * inputMode="decimal" rather than type="number", which on iOS avoids the
 * spinner and the scroll-wheel-changes-your-value trap.
 *
 * The steppers are out of the tab order on purpose. Tabbing from a weight to
 * the reps beside it went weight → minus → plus → reps: four presses to cross
 * two fields, and the two in the middle change the number she just typed if
 * she hits space or enter by reflex. They are a pointer affordance; from the
 * keyboard the same job is the arrow keys inside the field, which is why the
 * field handles them.
 */
export function NumberField({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix,
  label,
  decimals = false,
  className = "",
  focusOnMount = false,
  blankAtZero = false,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label?: string;
  decimals?: boolean;
  className?: string;
  /**
   * Take the caret on mount and select what is in it, so the seeded number is
   * replaced by typing rather than appended to.
   *
   * Only ever for a field she has explicitly asked to fill in — arriving from
   * "Log your bench set" is a request to type a weight. Never on the target
   * inputs at the top of a card: focusing those the moment a card opens is a
   * keyboard over the thing she came to read, and was a bug once already.
   */
  focusOnMount?: boolean;
  /**
   * Show nothing rather than "0" when there is nothing to suggest.
   *
   * The first set of a movement she has never done has no weight to seed from:
   * no history, and a plan that did not name one. It rendered as 0, which is
   * the app's oldest bug class on a screen — unknown is not zero. A nought in
   * the box reads as a suggestion, and it is one she has to clear before she
   * can type. Blank with a placeholder says what is actually true: nobody
   * knows yet, tell me.
   */
  blankAtZero?: boolean;
  placeholder?: string;
}) {
  // Kept as text while she types, so "" and a trailing "." survive mid-entry
  // instead of being snapped back to a number on every keystroke.
  const blank = (n: number) => (blankAtZero && n === 0 ? "" : String(n));
  const [draft, setDraft] = useState(blank(value));
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);

  // Adjusted during render rather than in an effect: an effect that sets state
  // renders twice and, here, would fight her keystrokes.
  if (value !== seen && !editing) {
    setSeen(value);
    setDraft(blank(value));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    const el = box.current;
    if (!el) return;
    el.focus();
    // Selected, not just focused: she is replacing last set's weight, and a
    // caret after "95" means typing 100 gives 95100.
    el.select();
    // Run-once by design — refocusing whenever this re-renders would fight her
    // every time the value changes, which is every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (raw: string) => {
    const parsed = decimals ? parseFloat(raw) : parseInt(raw, 10);
    // Anything unparseable falls back to what it was, rather than to zero.
    onChange(Number.isFinite(parsed) ? clamp(parsed) : value);
    setEditing(false);
  };

  const nudge = (delta: number) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    // A tap on the stepper is her naming a number, so the field stops being
    // blank even when that number is zero.
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className={className}>
      {label && (
        <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-faint">{label}</p>
      )}
      <div className="flex items-center rounded-xl border border-edge bg-surface focus-within:border-accent">
        <button
          type="button"
          onClick={() => nudge(-step)}
          tabIndex={-1}
          aria-label={`Decrease${label ? ` ${label}` : ""}`}
          className="grid size-12 shrink-0 place-items-center text-2xl text-muted active:text-accent"
        >
          −
        </button>

        <input
          ref={box}
          value={draft}
          onChange={(e) => {
            setEditing(true);
            // Digits, one dot, nothing else — keeps a stray letter from a
            // predictive keyboard out of the field.
            setDraft(e.target.value.replace(decimals ? /[^\d.]/g : /[^\d]/g, ""));
          }}
          placeholder={placeholder}
          onFocus={(e) => {
            setEditing(true);
            const el = e.currentTarget;
            el.select();
            // Again on the next frame: iOS places the caret on touch-end,
            // *after* focus, which collapses a selection made here — so the
            // seeded number ends up appended to rather than replaced, and
            // typing 135 over 95 gives 95135.
            requestAnimationFrame(() => {
              if (document.activeElement === el) el.select();
            });
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.currentTarget.blur(); return; }
            // What the steppers do, for the keyboard: they are skipped by Tab,
            // so the nudge has to live somewhere she can reach.
            if (e.key === "ArrowUp") { e.preventDefault(); nudge(step); }
            if (e.key === "ArrowDown") { e.preventDefault(); nudge(-step); }
          }}
          inputMode={decimals ? "decimal" : "numeric"}
          enterKeyHint="done"
          aria-label={label ?? "Value"}
          className="w-full min-w-0 bg-transparent py-3 text-center text-xl font-semibold tabular outline-none"
        />

        {suffix && <span className="shrink-0 pr-1 text-sm text-faint">{suffix}</span>}

        <button
          type="button"
          onClick={() => nudge(step)}
          tabIndex={-1}
          aria-label={`Increase${label ? ` ${label}` : ""}`}
          className="grid size-12 shrink-0 place-items-center text-2xl text-muted active:text-accent"
        >
          +
        </button>
      </div>
    </div>
  );
}
