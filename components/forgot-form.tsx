"use client";

import { useState } from "react";

const FIELD =
  "w-full rounded-xl border border-edge bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none";

/** The address, and one answer whatever it was — the server never says which addresses exist. */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) setDone(data.message ?? "Check your email.");
      else setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p role="status" className="w-full max-w-xs rounded-xl border border-line bg-surface px-4 py-3 text-center text-[14px] leading-relaxed text-muted">{done}</p>;
  }
  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-3">
      <input type="email" required autoFocus autoComplete="email" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        aria-label="Email address" className={FIELD} />
      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
      <button type="submit" disabled={busy || !email}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-40">
        {busy ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}
