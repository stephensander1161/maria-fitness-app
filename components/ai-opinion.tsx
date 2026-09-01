"use client";

import { useEffect, useState } from "react";
import { streamCoach } from "@/lib/client";
import { RichText } from "./rich-text";

/**
 * "Get my coach's read" — the coach's take on whatever screen she is on.
 *
 * The page's data is assembled on the server from the request, so the browser
 * never authors what the coach is told. It streams into a sheet rather than
 * navigating to the chat, because the point is to read it against the numbers
 * she is already looking at.
 */
export function AiOpinion({ page, label }: { page: "train" | "plan" | "progress"; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-accent active:bg-raised"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
        Coach&apos;s read
      </button>
      {open && <Sheet page={page} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({
  page, label, onClose,
}: { page: "train" | "plan" | "progress"; label: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A subscription to a stream, with cleanup — which is what effects are for.
    // Closing the sheet mid-answer aborts the request rather than leaving it
    // running and writing into a component that is gone.
    const controller = new AbortController();
    let live = true;

    (async () => {
      let acc = "";
      try {
        for await (const event of streamCoach({ opinion: page }, { signal: controller.signal })) {
          if (!live) return;
          if (event.type === "text") { acc += event.text; setText(acc); }
          else if (event.type === "error") setError(event.message);
        }
      } catch {
        if (live) setError("Couldn't reach your coach.");
      }
      if (live) setDone(true);
    })();

    return () => { live = false; controller.abort(); };
  }, [page]);

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/70 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
        // This sheet scrolls inside itself, so the page-level pull gesture
        // must leave it alone.
        data-no-pull-to-refresh=""
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold">On your {label}</h2>
          <button onClick={onClose} className="text-[13px] text-muted">Close</button>
        </div>

        {error ? (
          <p className="rounded-xl border border-miss/40 bg-miss-soft px-3 py-2 text-[13px] text-miss">
            {error}
          </p>
        ) : text ? (
          <div className="text-[15px]"><RichText>{text}</RichText></div>
        ) : (
          <div className="flex justify-center gap-1.5 py-10">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}

        {done && !error && (
          <p className="mt-5 text-center text-[12px] text-faint">
            Saved to your conversation — carry on with it on the Coach tab.
          </p>
        )}
      </div>
    </div>
  );
}
