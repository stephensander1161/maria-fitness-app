"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "@/lib/signup";

const FIELD =
  "w-full rounded-xl border border-edge bg-surface px-4 py-3.5 text-center text-[15px] placeholder:text-faint focus:border-accent focus:outline-none";

/**
 * Claiming an invitation: the address she was invited with, a name if we do
 * not have one, and a password of her own choosing. The server decides
 * whether the address may be claimed — see lib/signup.ts — and this only
 * catches the two mistakes that need no round trip.
 */
export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = email.length > 0 && password.length > 0 && confirm.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_RULE);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        // Same as signing in: the cookie is set before this runs, so the
        // navigation carries the session, and refresh() drops the cached
        // sign-up render so the back button cannot show a stale gate.
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
        placeholder="The email you were invited with"
        aria-label="Email"
        autoComplete="username"
        inputMode="email"
        autoFocus
        className={FIELD}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        aria-label="Your name"
        autoComplete="name"
        maxLength={80}
        className={FIELD}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Choose a password"
        aria-label="Password"
        aria-describedby="password-rule"
        autoComplete="new-password"
        className={FIELD}
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="And again"
        aria-label="Confirm password"
        autoComplete="new-password"
        className={FIELD}
      />
      <p id="password-rule" className="px-1 text-center text-[12px] text-faint">{PASSWORD_RULE}</p>
      <button
        type="submit"
        disabled={busy || !ready}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink disabled:opacity-40"
      >
        {busy ? "Setting up…" : "Create my password"}
      </button>
      {error && <p role="alert" className="text-center text-[13px] text-miss">{error}</p>}
    </form>
  );
}
