"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ google }: { google: boolean }) {
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
    <div className="w-full max-w-xs">
      {google && (
        <>
          {/* A plain link, not fetch: the OAuth round trip is a top-level
              navigation, and the state cookie has to ride along with it. */}
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-edge bg-surface py-3.5 text-[15px] font-medium active:bg-raised"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
            </svg>
            Continue with Google
          </a>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] uppercase tracking-wide text-faint">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="username"
        inputMode="email"
        autoFocus
        className="w-full rounded-xl border border-edge bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="w-full rounded-xl border border-edge bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-on-accent disabled:opacity-40"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
        {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
      </form>
    </div>
  );
}
