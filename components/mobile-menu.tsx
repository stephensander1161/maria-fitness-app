"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { isChromeless } from "@/lib/chromeless";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";
import { useSignOut } from "./sign-out";
import { moreItems } from "./more-nav";
import { TABS } from "./tab-bar";

/**
 * The rest of the app, from the top of a phone screen.
 *
 * Friends, Recovery, Settings and Admin lived in a row of pills at the *end*
 * of every page. On a long Train screen that meant scrolling past everything
 * to find Settings — half the app, hidden below the fold on the device most
 * people use. The bottom bar has six tabs and no room for a seventh.
 *
 * So: one button in the greeting bar, a sheet with the same list. The list is
 * shared with the bottom row (`moreItems`), so a new destination cannot reach
 * one and quietly miss the other — the failure that put Friends and Admin in
 * the sidebar and nowhere on a phone.
 *
 * The six main screens are here too, above the rest. The bottom bar is a
 * `position: fixed` strip, and a phone browser's own toolbar can sit on top
 * of exactly that strip — the owner opened the app in a browser whose bottom
 * bar covered it and could not reach Train or Plan at all. Every screen has
 * to be reachable from something in normal flow, and this button is it.
 */
export function MobileMenu({ isOwner, recovering }: { isOwner: boolean; recovering: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { signOut, busy, error } = useSignOut();
  const panel = useDialog(() => setOpen(false));

  if (isChromeless(path)) return null;
  const items = moreItems(isOwner, recovering).filter((i) => !path.startsWith(i.href));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        aria-haspopup="dialog"
        className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted transition-colors active:bg-raised md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim/70 backdrop-blur-sm md:items-center md:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div
            ref={panel}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl border-t border-line bg-surface p-3 md:rounded-2xl md:border"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
          >
            {/* The screens the bottom bar carries, for when the bottom bar is
                under something. Same list, so they cannot disagree. */}
            <ul className="mb-2 grid grid-cols-3 gap-1 border-b border-line/60 pb-3" aria-label="Screens">
              {TABS.map((tab) => {
                const active = path.startsWith(tab.href);
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[12px] font-medium transition-colors active:bg-raised ${
                        active ? "text-accent" : "text-text"
                      }`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d={tab.icon} />
                      </svg>
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors active:bg-raised"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-muted">
                      {i.icon}
                    </svg>
                    {i.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  onClick={() => { setOpen(false); setFeedback(true); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors active:bg-raised"
                >
                  <span className="text-muted"><FeedbackGlyph size={18} /></span>
                  Tell us
                </button>
              </li>
              <li className="border-t border-line/60 pt-1">
                {confirming ? (
                  <div className="px-3 py-2">
                    <p className="text-[13px] text-muted">Sign out on this phone?</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={signOut} disabled={busy}
                        className="rounded-full border border-miss/40 bg-miss-soft px-3.5 py-1.5 text-[13px] text-miss disabled:opacity-50">
                        {busy ? "Signing out…" : "Sign out"}
                      </button>
                      <button onClick={() => setConfirming(false)} disabled={busy}
                        className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted">
                        Cancel
                      </button>
                    </div>
                    {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] text-faint transition-colors active:bg-raised"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                    </svg>
                    Sign out
                  </button>
                )}
              </li>
            </ul>
          </div>
        </div>
      )}
      {feedback && <FeedbackSheet path={path} onClose={() => setFeedback(false)} />}
    </>
  );
}
