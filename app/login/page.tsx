import { LoginForm } from "@/components/login-form";
import { googleConfigured } from "@/lib/oauth";

export const metadata = { title: "Coach" };
export const dynamic = "force-dynamic";

/** Said plainly. "Something went wrong" tells her nothing she can act on. */
const MESSAGES: Record<string, string> = {
  not_invited: "That Google account isn't on the list. Ask for an invite.",
  disabled: "That account has been turned off.",
  cancelled: "Sign-in cancelled.",
  expired: "That took too long — try again.",
  rate_limited: "Too many attempts. Try again in an hour.",
  failed: "Google sign-in didn't work. Try your password instead.",
  google_unavailable: "Google sign-in isn't set up on this deployment.",
  unavailable: "Sign-in is unavailable right now.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)"
        strokeWidth="1.6" strokeLinecap="round" className="mb-6">
        <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
      </svg>
      <h1 className="text-2xl font-bold tracking-tight">Coach</h1>
      <p className="mb-8 mt-1 text-sm text-muted">Let&apos;s get to work.</p>

      {error && (
        <p className="mb-5 w-full max-w-xs rounded-xl border border-miss/40 bg-miss-soft px-4 py-3 text-center text-[13px] text-miss">
          {MESSAGES[error] ?? MESSAGES.unavailable}
        </p>
      )}

      <LoginForm google={googleConfigured()} />
    </div>
  );
}
