"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One implementation of leaving, shared by the foot of Settings on a phone and
 * the desktop sidebar.
 *
 * Never navigate to /login on a failure. Offline, the unhandled rejection used
 * to kill the handler and the button simply did nothing; on a 5xx she landed
 * on the sign-in screen still holding a valid session cookie, which on a
 * borrowed phone means walking away believing she had signed out.
 */
export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "DELETE",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Couldn't sign you out — you're still signed in. Try again when you have a connection.");
      setBusy(false);
    }
  }

  return { signOut, busy, error };
}

/** The foot of Settings. A phone has no sidebar, so this is where it lives there. */
export function SignOut() {
  const [confirming, setConfirming] = useState(false);
  const { signOut, busy, error } = useSignOut();

  return (
    <div className="mt-6 text-center">
      {confirming ? (
        <div className="flex justify-center gap-2">
          <button onClick={() => setConfirming(false)}
            className="rounded-full border border-line px-4 py-2 text-[13px] text-muted">
            Cancel
          </button>
          <button onClick={signOut} disabled={busy}
            className="rounded-full border border-miss/40 bg-miss-soft px-4 py-2 text-[13px] text-miss disabled:opacity-50">
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="-my-2 px-4 py-2 text-[13px] text-faint">
          Sign out
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>
      )}
    </div>
  );
}

/**
 * The same thing as a row in the desktop sidebar, beneath "Tell us".
 *
 * It used to be the last thing on the Settings page, which on a desktop meant
 * opening Settings to leave — a menu is where a mouse expects to find it. The
 * row turns into its own confirmation rather than opening a dialog: one
 * accidental click should cost a second click, not a session.
 */
export function SignOutNavItem() {
  const [confirming, setConfirming] = useState(false);
  const { signOut, busy, error } = useSignOut();

  if (confirming) {
    return (
      <div className="rounded-xl bg-raised px-3 py-2.5">
        <p className="text-[12px] text-muted">Sign out on this computer?</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={signOut}
            disabled={busy}
            className="rounded-full border border-miss/40 bg-miss-soft px-3 py-1.5 text-[12px] text-miss disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full border border-line px-3 py-1.5 text-[12px] text-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] leading-snug text-miss">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-faint transition-colors hover:bg-raised hover:text-muted"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
      </svg>
      Sign out
    </button>
  );
}
