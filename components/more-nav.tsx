"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FeedbackGlyph, FeedbackSheet } from "./feedback";

/**
 * The rest of the app, on a phone.
 *
 * A phone has no sidebar, so everything the desktop keeps at the foot of the
 * nav has to live somewhere — and it was living in one hard-coded pair.
 * Friends and Admin shipped with a sidebar entry and no phone entry at all,
 * which on a phone means the feature does not exist.
 *
 * Two rules, both of which were broken:
 *   • the same destinations as the sidebar, from one list, so a new one cannot
 *     reach a desktop and quietly miss a phone;
 *   • never offer the screen she is already on. "Settings" on the Settings
 *     page is a dead link that costs a tap to discover.
 */
const CHROMELESS = ["/login", "/signup", "/welcome", "/"];

type Item = { href: string; label: string; icon: React.ReactNode };

const gear = (
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M4.5 12a7.5 7.5 0 0 1 .1-1.2l-2-1.5 2-3.4 2.3.9a7.5 7.5 0 0 1 2.1-1.2L9.4 3h4.2l.4 2.6c.8.3 1.5.7 2.1 1.2l2.3-.9 2 3.4-2 1.5c0 .4.1.8.1 1.2s0 .8-.1 1.2l2 1.5-2 3.4-2.3-.9c-.6.5-1.3.9-2.1 1.2l-.4 2.6H9.4l-.4-2.6a7.5 7.5 0 0 1-2.1-1.2l-2.3.9-2-3.4 2-1.5c0-.4-.1-.8-.1-1.2Z" />
  </>
);

export function MoreNav({ isOwner, recovering }: { isOwner: boolean; recovering: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  if (CHROMELESS.includes(path)) return null;

  const items: Item[] = [
    ...(recovering
      ? [{ href: "/recovery", label: "Recovery", icon: <path d="M12 20s-7-4.5-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.5 12 20 12 20Z" /> } as Item]
      : []),
    { href: "/friends", label: "Friends", icon: <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3.5 3.5 0 0 1 0 6.8" /> },
    { href: "/settings", label: "Settings", icon: gear },
    ...(isOwner
      ? [{ href: "/admin", label: "Admin", icon: <path d="M12 3 4 6.5v5c0 4.4 3.4 8.4 8 9.5 4.6-1.1 8-5.1 8-9.5v-5L12 3Z" /> } as Item]
      : []),
  ].filter((i) => !path.startsWith(i.href));

  return (
    <>
      <div className="mt-4 flex flex-wrap justify-center gap-2 md:hidden">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[12px] text-faint transition-colors active:bg-raised"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {i.icon}
            </svg>
            {i.label}
          </Link>
        ))}
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
