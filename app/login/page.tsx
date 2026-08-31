import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Coach" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)"
        strokeWidth="1.6" strokeLinecap="round" className="mb-6">
        <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
      </svg>
      <h1 className="text-2xl font-bold tracking-tight">Coach</h1>
      <p className="mb-8 mt-1 text-sm text-muted">Let&apos;s get to work.</p>
      <LoginForm />
    </div>
  );
}
