import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";
import { googleConfigured } from "@/lib/oauth";

export const metadata = { title: "Plate" };
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
      <Logo size={64} className="mb-6" />
      <h1 className="text-2xl font-bold tracking-tight">Plate</h1>
      <p className="mb-8 mt-1 text-sm text-muted">Let&apos;s get to work.</p>

      {error && (
        <p className="mb-5 w-full max-w-xs rounded-xl border border-miss/40 bg-miss-soft px-4 py-3 text-center text-[13px] text-miss">
          {MESSAGES[error] ?? MESSAGES.unavailable}
        </p>
      )}

      <LoginForm google={googleConfigured()} />

      {/* Invited but without a password yet — the one case sign-in cannot help with. */}
      <p className="mt-6 text-[13px] text-faint">
        Invited?{" "}
        <Link href="/signup" className="text-muted underline underline-offset-2">Set up your account</Link>
      </p>
    </div>
  );
}
