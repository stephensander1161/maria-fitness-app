"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { useDialog } from "@/lib/use-dialog";

type Kind = "idea" | "bug" | "confusing";
type Item = { kind: Kind; request: string; status: string; reply: string | null; submitted: string };

const KINDS: { key: Kind; label: string }[] = [
  { key: "idea", label: "I wish it…" },
  { key: "bug", label: "Something broke" },
  { key: "confusing", label: "This confused me" },
];

const STATUS_TONE: Record<string, string> = {
  new: "text-faint",
  planned: "text-hold",
  shipped: "text-beat",
  declined: "text-faint",
};

const STATUS_LABEL: Record<string, string> = {
  new: "sent",
  planned: "planned",
  shipped: "done",
  declined: "not doing",
};

/**
 * Reachable from every screen, because the moment she notices something is the
 * only moment she'll bother reporting it. The current route rides along — "this
 * is confusing" is far more useful when you know where she was.
 *
 * Not on the coach screen: the floating button sat on top of the message box
 * there, and that screen has its own way in — the coach takes feedback in
 * conversation, and the header carries the same sheet.
 */
export function Feedback() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Same reason as the tab bar: nothing but the form should be reachable here.
  if (path === "/login" || path === "/welcome" || path === "/") return null;

  return (
    <>
      {/*
        In the page, at the end of it — not floating over it.
        As a fixed bubble it sat on top of whatever happened to be at the
        bottom of the screen, which since the fact card moved down there meant
        covering a sentence on every single page. Feedback is not urgent
        enough to occlude content, and the end of the page is where anyone
        looks for it anyway. The desktop has the same entry in the sidebar.
      */}
      <div className="mt-4 flex justify-center md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[12px] text-faint transition-colors active:bg-raised"
        >
          <FeedbackGlyph size={14} />
          Tell us
        </button>
      </div>
      {open && <FeedbackSheet path={path} onClose={() => setOpen(false)} />}
    </>
  );
}

export function FeedbackGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c4.97 0 9 3.13 9 7s-4.03 7-9 7c-.9 0-1.77-.1-2.58-.3L5 19l.9-3.2A7.9 7.9 0 0 1 3 10c0-3.87 4.03-7 9-7Z" />
      <path d="M12 7v3.5M12 13h.01" />
    </svg>
  );
}

/** The same thing as a row, for the desktop sidebar. */
export function FeedbackNavItem() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path === "/login" || path === "/welcome" || path === "/") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-faint transition-colors hover:bg-raised hover:text-muted"
      >
        <FeedbackGlyph size={16} />
        Tell us
      </button>
      {open && <FeedbackSheet path={path} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The sheet itself, so the coach screen can open it from its header. */
export function FeedbackSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("idea");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [past, setPast] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    action<Item[]>("list_feedback")
      .then((items) => { if (!cancelled) setPast(items); })
      .catch(() => { if (!cancelled) setPast([]); });
    return () => { cancelled = true; };
  }, []);
  const panel = useDialog(onClose);

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await action("submit_feedback", { kind, body: body.trim(), path });
      setBody("");
      setSent(true);
      setPast(await action<Item[]>("list_feedback"));
    } catch (err) {
      // Silently dropping what she took the trouble to write is the surest way
      // to stop her writing anything again.
      setError(actionMessage(err, "That didn't send — try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6 bg-ink/70 backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Send feedback">
      <div ref={panel}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line md:rounded-2xl md:border md:shadow-2xl md:shadow-ink/60 bg-surface p-5"
        // This sheet scrolls inside itself, so the page-level pull gesture
        // must leave it alone.
        data-no-pull-to-refresh=""
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Tell us</h2>
          <button onClick={onClose} className="-my-2 px-2 py-2 text-[13px] text-muted">Close</button>
        </div>

        {sent ? (
          <div className="rounded-xl border border-beat/40 bg-beat-soft px-4 py-3 text-[14px] text-beat">
            Got it — that&apos;s on the list.
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => (
                <button key={k.key} onClick={() => setKind(k.key)}
                  className={`rounded-xl border px-2 py-2.5 text-[12px] ${
                    kind === k.key ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                  }`}>
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              placeholder="What would make this better?"
              className="w-full resize-none rounded-xl border border-line bg-base px-4 py-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              onClick={submit}
              disabled={saving || !body.trim()}
              className="mt-2 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-ink disabled:opacity-40"
            >
              {saving ? "Sending…" : "Send"}
            </button>
          {error && <p role="alert" className="mt-2 text-center text-[13px] text-miss">{error}</p>}
          </>
        )}

        {past && past.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">You&apos;ve asked for</p>
            <ul className="space-y-2.5">
              {past.map((item, i) => (
                <li key={i} className="border-b border-line/60 pb-2.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[13px] text-muted">{item.request}</p>
                    <span className={`shrink-0 text-[11px] ${STATUS_TONE[item.status] ?? "text-faint"}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </div>
                  {item.reply && <p className="mt-1 text-[12px] text-accent">↳ {item.reply}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
