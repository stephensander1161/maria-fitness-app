"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { LOGO_MARKS, type LogoMarkId } from "@/lib/logo-mark";
import { Logo } from "./logo";

/**
 * Picking which plate the app wears.
 *
 * The mark is the label, for the same reason the theme's swatch is: a row of
 * names tells you nothing about what you are choosing, and here the drawing
 * *is* the information. Each option renders the real thing at the size it is
 * actually used at in the sidebar, not an illustration of it.
 *
 * Applied by the server on the next render, like the theme — the mark is read
 * off the profile where the layout is built, and two places deciding what it
 * is, is how they drift.
 */
export function LogoPicker({ current }: { current: LogoMarkId }) {
  const router = useRouter();
  const [saving, setSaving] = useState<LogoMarkId | null>(null);
  const [chosen, setChosen] = useState<LogoMarkId>(current);
  const [error, setError] = useState<string | null>(null);

  async function pick(logo: LogoMarkId) {
    if (logo === chosen) return;
    setSaving(logo);
    setError(null);
    const previous = chosen;
    setChosen(logo);
    try {
      await action("set_logo", { logo });
      router.refresh();
    } catch (err) {
      // Put the tick back where it was, or the screen claims a change the
      // server never made.
      setChosen(previous);
      setError(actionMessage(err, "Couldn't change the mark."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">Mark</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        A plate is the thing on the end of a bar and the thing dinner is on. A pauldron
        is the third kind.
      </p>

      {/* One column on a phone: two put "Shoulder plate" through an ellipsis,
          and a picker whose options cannot be read is not a picker. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {LOGO_MARKS.map((m) => {
          const active = chosen === m.id;
          return (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              aria-pressed={active}
              disabled={saving !== null}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                active ? "border-accent bg-accent-soft" : "border-edge hover:bg-raised"
              }`}
            >
              {/* The real mark, at the size the sidebar draws it — an option
                  previewed at 64px is a promise about a glyph she will only
                  ever see at 26. */}
              <Logo mark={m.id} size={34} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{m.name}</span>
                <span className="block text-[11px] leading-snug text-muted">{m.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Said once, here, because somebody will change this and then wonder
          why the home-screen icon did not follow — and the honest answer is
          that it cannot. See lib/brand.ts. */}
      <p className="mt-3 text-[12px] leading-relaxed text-faint">
        The home-screen and browser-tab icons stay as they are. Those are one image for
        everyone on this address, cached by the browser long after a choice is made.
      </p>

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
