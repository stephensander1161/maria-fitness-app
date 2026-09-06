"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PHRASE = "delete my account";

/**
 * Leaving for good.
 *
 * Distinct from "erase my data", which keeps the account so she can come
 * back to an empty app. This removes the account itself and everything under
 * it, immediately. The phrase is typed rather than clicked, because there is
 * no undo and no copy, and the one thing worse than a deletion is an
 * accidental one.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim().toLowerCase() }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "That didn't go through — nothing was deleted.");
      }
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through — nothing was deleted.");
      setBusy(false);
    }
  }

  return (
    <section className="card mt-3 border-miss/30 p-5">
      <h2 className="text-[15px] font-semibold">Delete your account</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Removes your account and everything under it — training, food, weigh-ins, measurements,
        photos, plans, your kitchen, the whole conversation, and the coach&apos;s memory of you.
        Immediately, permanently, with no copy to restore from. To come back you would need a
        new invitation.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border border-miss/50 px-4 py-2.5 text-[13px] font-medium text-miss transition-colors hover:bg-miss-soft"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-miss/40 bg-miss-soft p-3">
          <p className="text-[13px] leading-relaxed text-text">
            This cannot be undone. Type <span className="font-semibold">{PHRASE}</span> to confirm.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Type ${PHRASE} to confirm`}
            autoComplete="off"
            spellCheck={false}
            placeholder={PHRASE}
            className="mt-2 w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[15px] placeholder:text-faint focus:border-miss focus:outline-none"
          />
          {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={remove}
              disabled={busy || typed.trim().toLowerCase() !== PHRASE}
              className="flex-1 rounded-xl bg-miss py-2.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button
              onClick={() => { setOpen(false); setTyped(""); setError(null); }}
              disabled={busy}
              className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-muted disabled:opacity-50"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
