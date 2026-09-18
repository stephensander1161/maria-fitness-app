import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetForm } from "@/components/reset-form";
import { parseToken } from "@/lib/reset";

export const metadata = { title: "Sore Winner" };

/** The new password, with the emailed link as proof. lib/reset.ts. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = parseToken(token);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
      <Logo size={64} className="mb-6" />
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      {ok ? (
        <>
          <p className="mb-8 mt-1 max-w-xs text-center text-sm text-muted">
            Every other device signed in as you is signed out when you save.
          </p>
          <ResetForm token={ok} />
        </>
      ) : (
        <p className="mb-8 mt-1 max-w-xs text-center text-sm text-muted">
          That link isn&apos;t right.{" "}
          <Link href="/forgot" className="text-muted underline underline-offset-2">Ask for a new one</Link>.
        </p>
      )}
    </div>
  );
}
