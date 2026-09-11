"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * What the owner can change about somebody else, from the screen.
 *
 * It was the command line only, which meant giving a person more allowance
 * required a terminal and the production credential — so in practice it
 * happened hours later, or not at all, while their coach sat switched off.
 *
 * The rules have not moved an inch. This posts to an owner-gated route that
 * calls the same `lib/budget.ts` the terminal calls: a budget can still only
 * *tighten* the deployment's ceiling, never lift it. None of it is a tool, so
 * nothing the model can be talked into reaches it.
 *
 * A one-day grant that goes *above* the ceiling is deliberately not here. It
 * is the only thing in this app that can, it should be rare and considered,
 * and a row of +$1 buttons on a list of people is neither — `npm run user --
 * topup` still does it.
 */
export function AccountControls({
  userId, email, role, isOnlyOwner,
}: {
  userId: string;
  email: string;
  role: "owner" | "member";
  /** Demoting the last owner locks the console for everybody. */
  isOnlyOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  async function post(action: "budget" | "role", value: string, confirmEmail?: string) {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, value, confirmEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "That didn't work.");
      setNote(data.note ?? "Saved.");
      setConfirming(false);
      setTyped("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t border-line/60 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-faint">Daily cap</span>
        <Amount label="Set" placeholder="2.00" busy={busy === "budget"} onSend={(v) => post("budget", v)} />
        <button
          onClick={() => post("budget", "none")}
          disabled={busy !== null}
          className="rounded-full px-2 py-1.5 text-[12px] text-faint underline underline-offset-2 disabled:opacity-40"
        >
          full ceiling
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-faint">Console</span>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy !== null || (role === "owner" && isOnlyOwner)}
            title={role === "owner" && isOnlyOwner ? "The only owner — promote somebody else first" : undefined}
            className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted active:bg-raised disabled:opacity-40"
          >
            {role === "owner" ? "Remove access" : "Make an owner"}
          </button>
        ) : (
          /* The email, retyped. This is a list of people with a button beside
             each of them, so the mistake worth guarding against is granting
             the console to the wrong row — which is silent, and which nothing
             on this screen would show afterwards. */
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              aria-label={`Type ${email} to confirm`}
              className="min-w-0 flex-1 rounded-lg border border-edge bg-base px-2.5 py-1.5 text-[12.5px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => post("role", role === "owner" ? "member" : "owner", typed)}
              disabled={busy !== null}
              className="rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              onClick={() => { setConfirming(false); setTyped(""); }}
              className="rounded-full px-2 py-1.5 text-[12px] text-faint"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {note && <p className="mt-2 text-[12px] text-beat">{note}</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </div>
  );
}

function Amount({
  label, placeholder, busy, onSend,
}: { label: string; placeholder: string; busy: boolean; onSend: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSend(value.trim()); }}
      className="flex items-center gap-1.5"
    >
      <span className="text-[12px] text-faint">$</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label="Daily cap in dollars"
        className="w-20 rounded-lg border border-edge bg-base px-2.5 py-1.5 text-[12.5px] tabular placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted active:bg-raised disabled:opacity-40"
      >
        {busy ? "…" : label}
      </button>
    </form>
  );
}
