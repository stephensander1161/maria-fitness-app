"use client";

import { useState } from "react";
import { action, actionMessage } from "@/lib/client";

/**
 * Take the conversation away with you.
 *
 * Copy first, download second, and deliberately in that order: the reason this
 * exists is that when the coach says something wrong, the fix starts with
 * someone reading exactly what it said — and pasting into a message is the
 * shortest path from her phone to that. The file is for keeping.
 */
export function TranscriptExport() {
  const [busy, setBusy] = useState<"copy" | "file" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(3);

  async function fetchText() {
    return action<{ ok: boolean; text: string; filename: string; messages: number }>(
      "export_transcript", { days },
    );
  }

  async function copy() {
    setBusy("copy");
    setError(null);
    try {
      const r = await fetchText();
      await navigator.clipboard.writeText(r.text);
      setDone(`Copied ${r.messages} messages`);
      setTimeout(() => setDone(null), 3000);
    } catch (err) {
      setError(actionMessage(err, "Couldn't copy that."));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("file");
    setError(null);
    try {
      const r = await fetchText();
      // Built and revoked here rather than held: a blob URL keeps the whole
      // transcript alive in memory for as long as it exists.
      const url = URL.createObjectURL(new Blob([r.text], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(`${r.messages} messages`);
      setTimeout(() => setDone(null), 3000);
    } catch (err) {
      setError(actionMessage(err, "Couldn't save that."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <h2 className="text-[15px] font-semibold">Your conversation</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Every message with the time it was said, and the name of each thing your coach did. Useful
        when it gets something wrong and someone needs to see exactly what happened.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[1, 3, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${
              days === d ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            }`}
          >
            {d === 1 ? "Today" : `${d} days`}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={copy}
          disabled={busy !== null}
          className="rounded-full border border-line px-4 py-2 text-[13px] text-accent disabled:opacity-40"
        >
          {busy === "copy" ? "Copying…" : "Copy"}
        </button>
        <button
          onClick={download}
          disabled={busy !== null}
          className="rounded-full border border-line px-4 py-2 text-[13px] text-muted disabled:opacity-40"
        >
          {busy === "file" ? "Saving…" : "Download"}
        </button>
        {done && <span className="text-[12px] text-beat">{done}</span>}
      </div>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
