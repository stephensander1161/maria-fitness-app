"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { THEMES, type ThemeId } from "@/lib/theme";

/**
 * Picking a look.
 *
 * The swatch is the label. A row of names tells you nothing about what you are
 * choosing, and this is the one setting where the preview *is* the
 * information — so each option shows its own background, card and accent, in
 * its own colours rather than the current theme's.
 *
 * The change is applied by the server on the next render, since the palette is
 * stamped on <html> there. So this refreshes rather than trying to swap the
 * attribute itself: two places deciding what the theme is, is how they drift.
 */
export function ThemePicker({ current }: { current: ThemeId }) {
  const router = useRouter();
  const [saving, setSaving] = useState<ThemeId | null>(null);
  const [chosen, setChosen] = useState<ThemeId>(current);
  const [error, setError] = useState<string | null>(null);

  async function pick(theme: ThemeId) {
    if (theme === chosen) return;
    setSaving(theme);
    setError(null);
    const previous = chosen;
    setChosen(theme);
    try {
      await action("set_theme", { theme });
      router.refresh();
    } catch (err) {
      // Put the tick back where it was, or the screen claims a change the
      // server never made.
      setChosen(previous);
      setError(actionMessage(err, "Couldn't change the theme."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">Theme</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        How the app looks. It follows your account, so it is the same on your phone and
        your laptop.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => {
          const active = chosen === t.id;
          return (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              aria-pressed={active}
              disabled={saving !== null}
              className={`rounded-xl border p-2 text-left transition-colors disabled:opacity-60 ${
                active ? "border-accent bg-accent-soft" : "border-edge hover:bg-raised"
              }`}
            >
              {/* The preview paints itself in the theme's own colours, not the
                  ones currently on screen — otherwise every option looks the
                  same and the choice is a guess. */}
              <span
                className="flex h-12 w-full items-center gap-1.5 rounded-lg px-2"
                style={{ background: t.swatch[0] }}
                aria-hidden
              >
                <span className="h-7 flex-1 rounded-md" style={{ background: t.swatch[1] }} />
                <span className="h-7 w-7 shrink-0 rounded-full" style={{ background: t.swatch[2] }} />
              </span>
              <span className="mt-2 flex items-baseline justify-between gap-1">
                <span className={`text-[13px] font-medium ${active ? "text-accent" : ""}`}>{t.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-faint">{t.scheme}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.blurb}</span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
