"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * The day's name, editable where she reads it.
 *
 * "Full Body B" is the planner's phrasing, and the first thing anyone wants to
 * do with a name a machine chose is change it. Asking the coach worked; having
 * to ask the coach to rename a heading did not feel like the app was hers.
 */
export function DayTitle({
  title, dayOfWeek, focus,
}: { title: string; dayOfWeek: number; focus: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Keyed off the title, so a rename from anywhere else — the coach, another
  // tab — resets the draft without an effect that writes state during render.
  const [draft, setDraft] = useState<{ for: string; text: string }>({ for: title, text: title });
  const value = draft.for === title ? draft.text : title;
  const setValue = (text: string) => setDraft({ for: title, text });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  async function save() {
    const next = value.trim();
    if (!next || next === title) { setEditing(false); setDraft({ for: title, text: title }); return; }
    setSaving(true);
    setError(null);
    try {
      await action("adjust_plan_day", { dayOfWeek, title: next });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <>
        <button
          onClick={() => setEditing(true)}
          className="group flex items-baseline gap-2 text-left"
          aria-label={`Rename ${title}`}
        >
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:opacity-40"
            aria-hidden>
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        {focus && <p className="mt-1 text-sm text-muted">{focus}</p>}
        {error && <p role="alert" className="mt-1 text-[12px] text-miss">{error}</p>}
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      className="flex items-center gap-2"
    >
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setEditing(false); setDraft({ for: title, text: title }); }
        }}
        disabled={saving}
        aria-label="Name for this day"
        maxLength={60}
        className="min-w-0 flex-1 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-2xl font-bold tracking-tight focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <button type="submit" disabled={saving}
        className="shrink-0 rounded-lg border border-line px-3 py-2 text-[13px] text-accent disabled:opacity-40">
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
