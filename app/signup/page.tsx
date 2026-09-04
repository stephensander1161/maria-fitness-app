import Link from "next/link";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Coach" };

/**
 * Sign-up, by invitation.
 *
 * Anyone can open this page; nobody can add an address through it. An
 * address has to have been invited first (`npm run user -- invite`), and this
 * is where its owner chooses the password — see lib/signup.ts for the rules.
 */
export default function SignupPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)"
        strokeWidth="1.6" strokeLinecap="round" className="mb-6">
        <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
      </svg>
      <h1 className="text-2xl font-bold tracking-tight">Set up your account</h1>
      <p className="mb-8 mt-1 max-w-xs text-center text-sm text-muted">
        Coach is by invitation. Use the email address you were invited with and choose a password.
      </p>

      <SignupForm />

      <p className="mt-6 text-[13px] text-faint">
        Already set up?{" "}
        <Link href="/login" className="text-muted underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}
