"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { useTapAway } from "@/lib/use-tap-away";
import type { WhatsNew } from "@/lib/whats-new";

/**
 * "New since you were last here." Same bubble as the shipped-request note,
 * same corner, shown only when there is no request note to show — one
 * thing at a time. Dismissing it is one tap and remembered on the account,
 * so it never becomes the thing she closes every morning — and the tap can
 * land anywhere, not just on the button. See lib/use-tap-away.ts.
 */
export function WhatsNewNote({ items }: { items: WhatsNew[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  // Tapping anywhere else puts it away — the button was the only way out, and
  // on a phone it sits low over the page she is trying to read. Safe here
  // because this note only ever tells her something; the shipped-request note
  // asks a question and keeps its buttons.
  const box = useTapAway<HTMLDivElement>(() => { if (!busy && !gone) void dismiss(); });
  if (gone || items.length === 0) return null;

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await action<{ ok?: boolean; error?: string }>("dismiss_whats_new");
      if (res && res.ok === false) { setError(res.error ?? "That didn't save."); return; }
      setGone(true);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(false);
    }
  }

  const shown = items.slice(0, 3);
  const more = items.length - shown.length;

  return (
    <div
      ref={box}
      role="status"
      className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm animate-[feature-rise_320ms_ease-out] md:inset-x-auto md:bottom-6 md:right-6 md:mx-0"
    >
      <div className="rounded-2xl border border-line bg-surface/95 p-4 shadow-lg shadow-scrim/50 backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">New since you were last here</p>
        <ul className="mt-2 space-y-2.5">
          {shown.map((e) => (
            <li key={e.id}>
              {e.href ? (
                <Link href={e.href} onClick={dismiss} className="text-[14px] font-medium leading-snug hover:text-accent">
                  {e.title}
                </Link>
              ) : (
                <p className="text-[14px] font-medium leading-snug">{e.title}</p>
              )}
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{e.blurb}</p>
            </li>
          ))}
        </ul>
        {more > 0 && <p className="mt-2 text-[12px] text-faint">and {more} more</p>}
        {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
        <button
          onClick={dismiss}
          disabled={busy}
          className="mt-3 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-muted disabled:opacity-50"
        >
          {busy ? "…" : "Got it"}
        </button>
      </div>
    </div>
  );
}
