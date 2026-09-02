"use client";

import { useState } from "react";

/**
 * A number you can either tap or type.
 *
 * Steppers alone are fine for nudging a weight up 5lb and miserable for
 * entering 172 from scratch. The centre is a real input, so both work — and
 * inputMode="decimal" rather than type="number", which on iOS avoids the
 * spinner and the scroll-wheel-changes-your-value trap.
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
}) {
  // Kept as text while she types, so "" and a trailing "." survive mid-entry
  // instead of being snapped back to a number on every keystroke.
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);

  // Adjusted during render rather than in an effect: an effect that sets state
  // renders twice and, here, would fight her keystrokes.
  if (value !== seen && !editing) {
    setSeen(value);
    setDraft(String(value));
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commit = (raw: string) => {
    const parsed = decimals ? parseFloat(raw) : parseInt(raw, 10);
    // Anything unparseable falls back to what it was, rather than to zero.
    onChange(Number.isFinite(parsed) ? clamp(parsed) : value);
    setEditing(false);
  };

  const nudge = (delta: number) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
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
          aria-label={`Decrease${label ? ` ${label}` : ""}`}
          className="grid size-12 shrink-0 place-items-center text-2xl text-muted active:text-accent"
        >
          −
        </button>

        <input
          value={draft}
          onChange={(e) => {
            setEditing(true);
            // Digits, one dot, nothing else — keeps a stray letter from a
            // predictive keyboard out of the field.
            setDraft(e.target.value.replace(decimals ? /[^\d.]/g : /[^\d]/g, ""));
          }}
          onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          inputMode={decimals ? "decimal" : "numeric"}
          enterKeyHint="done"
          aria-label={label ?? "Value"}
          className="w-full min-w-0 bg-transparent py-3 text-center text-xl font-semibold tabular outline-none"
        />

        {suffix && <span className="shrink-0 pr-1 text-sm text-faint">{suffix}</span>}

        <button
          type="button"
          onClick={() => nudge(step)}
          aria-label={`Increase${label ? ` ${label}` : ""}`}
          className="grid size-12 shrink-0 place-items-center text-2xl text-muted active:text-accent"
        >
          +
        </button>
      </div>
    </div>
  );
}
