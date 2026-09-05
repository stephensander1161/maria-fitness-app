"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

export type Shipped = { id: string; request: string; reply: string | null };

/**
 * "You asked for this."
 *
 * A small bubble in the corner rather than a modal: the point is to be noticed
 * and then got out of the way of. It is per person by construction — it comes
 * from her own request — and answering it is what makes it go away, including
 * "not quite", which puts the request straight back on the pile rather than
 * making her write it out a second time.
 */
export function ShippedNote({ items }: { items: Shipped[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = items[i];
  if (!item) return null;

  async function answer(fixed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await action<{ ok?: boolean; error?: string }>("acknowledge_shipped", {
        id: item.id, fixed, ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (res && res.ok === false) { setError(res.error ?? "That didn't save."); return; }
      setAsking(false);
      setNote("");
      setI((n) => n + 1);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm animate-[feature-rise_320ms_ease-out] md:inset-x-auto md:bottom-6 md:right-6 md:mx-0"
    >
      <div className="rounded-2xl border border-accent/40 bg-surface/95 p-4 shadow-lg shadow-scrim/50 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">You asked for this</p>
            <p className="mt-0.5 text-[14px] font-medium leading-snug">{item.reply ?? "It's ready."}</p>
            {!asking && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => answer(true)}
                  disabled={busy}
                  className="rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent disabled:opacity-50"
                >
                  {busy ? "…" : "That's fixed it"}
                </button>
                <button
                  onClick={() => setAsking(true)}
                  disabled={busy}
                  className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-muted disabled:opacity-50"
                >
                  Not quite
                </button>
              </div>
            )}
          </div>
        </div>

        {asking && (
          <div className="mt-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              autoFocus
              placeholder="What's still not right?"
              className="w-full resize-none rounded-xl border border-edge bg-base px-3 py-2 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => answer(false)}
                disabled={busy}
                className="rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send"}
              </button>
              <button
                onClick={() => setAsking(false)}
                disabled={busy}
                className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
      </div>
    </div>
  );
}
