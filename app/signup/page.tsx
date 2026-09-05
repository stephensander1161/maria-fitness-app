import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Plate" };

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
      <Logo size={64} className="mb-6" />
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
