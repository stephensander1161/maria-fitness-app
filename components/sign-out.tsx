"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mt-6 text-center">
      {confirming ? (
        <div className="flex justify-center gap-2">
          <button onClick={() => setConfirming(false)}
            className="rounded-full border border-line px-4 py-2 text-[13px] text-muted">
            Cancel
          </button>
          <button onClick={signOut}
            className="rounded-full border border-miss/40 bg-miss-soft px-4 py-2 text-[13px] text-miss">
            Sign out
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="text-[13px] text-faint">
          Sign out
        </button>
      )}
    </div>
  );
}
