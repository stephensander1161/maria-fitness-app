"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "@/lib/signup";

const FIELD =
  "w-full rounded-xl border border-edge bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) { setError(PASSWORD_RULE); return; }
    if (password !== confirm) { setError("Those two passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) { router.replace("/"); router.refresh(); return; }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-3">
      <input type="password" required autoFocus autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password"
        aria-label="New password" className={FIELD} />
      <input type="password" required autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Again"
        aria-label="New password, again" className={FIELD} />
      <p className="text-center text-[12px] text-faint">{PASSWORD_RULE}</p>
      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
      <button type="submit" disabled={busy || !password || !confirm}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-40">
        {busy ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}
