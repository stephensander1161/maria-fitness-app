"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Never navigate to /login on a failure. Offline, the unhandled rejection
   * used to kill the handler and the button simply did nothing; on a 5xx she
   * landed on the sign-in screen still holding a valid session cookie, which
   * on a borrowed phone means walking away believing she had signed out.
   */
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
