"use client";

import { useState } from "react";
import { action, actionMessage } from "@/lib/client";

/**
 * Take the conversation away with you.
 *
 * It exists because when the coach says something wrong, the fix starts with
 * someone reading exactly what it said.
 */
export function TranscriptDownload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const r = await action<{ text: string; filename: string }>("export_transcript", { days: 30 });
      // Built and revoked here rather than held: a blob URL keeps the whole
      // transcript alive in memory for as long as it exists.
      const url = URL.createObjectURL(new Blob([r.text], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename.replace(/\.txt$/, ".md");
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Nothing was lost and nothing changed — but a button that does nothing
      // when tapped is the failure this app keeps having, so it says so.
      setError(actionMessage(err, "Couldn't build the transcript."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative">
      <button
        onClick={download}
        disabled={busy}
        aria-label="Download this conversation"
        title="Download this conversation"
        className="grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-raised hover:text-muted disabled:opacity-40"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
        </svg>
      </button>
      {error && (
        <p role="alert" className="absolute right-0 top-9 z-10 w-48 rounded-lg border border-miss/40 bg-miss-soft px-2 py-1.5 text-[11px] text-miss">
          {error}
        </p>
      )}
    </span>
  );
}
