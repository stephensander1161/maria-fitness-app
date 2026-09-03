"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/** The literal the tool insists on. She types it; nothing types it for her. */
const PHRASE = "erase everything";

/**
 * Start over.
 *
 * Useful while building the app, and a thing people are entitled to ask for:
 * everything logged goes, the account stays, and the next screen is the one a
 * new person sees. It is the only control in the app that destroys data it
 * cannot get back, so it is behind a typed phrase rather than a confirm — a
 * dialog you can dismiss by tapping in the wrong place is not a decision.
 *
 * The account and password survive on purpose. "Delete everything I've logged"
 * and "close my account" are different requests, and conflating them means the
 * first one locks her out.
 */
export function EraseData() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await action("erase_all_my_data", { confirm: PHRASE });
      // Straight to the front door: the profile is back to its first run, and
      // every screen behind this one is describing data that no longer
      // exists. `replace` rather than `push`, so Back cannot return to a
      // settings page built from a profile that is gone.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't go through — nothing was deleted."));
      setBusy(false);
    }
  }

  return (
    <section className="card mb-3 border-miss/30 p-5">
      <h2 className="text-[15px] font-semibold">Start over</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Deletes everything you have logged — training, food, weigh-ins, measurements, photos,
        plans, your kitchen and the whole conversation — and puts the app back to its first run.
        Your account and password stay, so you can sign straight back in.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-xl border border-miss/50 px-4 py-2.5 text-[13px] font-medium text-miss transition-colors hover:bg-miss-soft"
        >
          Erase my data
        </button>
      ) : (
        <div className="mt-3 rounded-xl border border-miss/40 bg-miss-soft p-3">
          <p className="text-[13px] leading-relaxed text-text">
            This cannot be undone and there is no copy to restore from. Type{" "}
            <span className="font-semibold">{PHRASE}</span> to confirm.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Type ${PHRASE} to confirm`}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-edge bg-base px-3 py-2.5 text-[15px] placeholder:text-faint focus:border-miss focus:outline-none"
            placeholder={PHRASE}
          />
          {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={erase}
              disabled={busy || typed.trim().toLowerCase() !== PHRASE}
              className="flex-1 rounded-xl bg-miss py-2.5 text-[13px] font-semibold text-ink disabled:opacity-40"
            >
              {busy ? "Erasing…" : "Erase everything"}
            </button>
            <button
              onClick={() => { setOpen(false); setTyped(""); setError(null); }}
              disabled={busy}
              className="rounded-xl border border-line px-4 py-2.5 text-[13px] text-muted disabled:opacity-50"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
