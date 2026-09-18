import Link from "next/link";
import { Logo } from "@/components/logo";
import { ForgotForm } from "@/components/forgot-form";

export const metadata = { title: "Sore Winner" };

/** "Forgot your password?" — the address, and a link is sent. lib/reset.ts. */
export default function ForgotPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
      <Logo size={64} className="mb-6" />
      <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mb-8 mt-1 max-w-xs text-center text-sm text-muted">
        Type the address you signed up with and we&apos;ll email you a link to choose a new one.
      </p>
      <ForgotForm />
      <p className="mt-6 text-[13px] text-faint">
        Remembered it?{" "}
        <Link href="/login" className="text-muted underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}
