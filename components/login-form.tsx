"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // The Set-Cookie lands before this runs, so the navigation carries the
        // session and middleware lets it through. refresh() drops the cached
        // login render so the back button can't show a stale gate.
        router.replace("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="username"
        inputMode="email"
        autoFocus
        className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink disabled:opacity-40"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
      {error && <p className="text-center text-[13px] text-miss">{error}</p>}
    </form>
  );
}
