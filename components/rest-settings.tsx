"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { MAX_REST_SECONDS, MIN_REST_SECONDS, REST_GROUPS } from "@/lib/rest";

/**
 * How long she rests between sets.
 *
 * The plan writes a number for every movement, which is a reasonable default
 * and not a preference: someone training in a lunch hour wants sixty seconds
 * on everything, and someone squatting heavy wants three minutes on that and
 * ninety on the rest. So there is one number for everything, and a longer one
 * per muscle group where she wants it.
 *
 * The per-group half stays closed until she asks for it. Most people want one
 * number, and nine steppers is a form rather than a setting.
 */
const CHOICES = [45, 60, 90, 120, 180];

export function RestSettings({
  defaultRestSeconds, restByGroup,
}: {
  defaultRestSeconds: number | null;
  restByGroup: Record<string, number> | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = restByGroup ?? {};
  const custom = Object.keys(groups).length;

  async function save(input: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action("set_rest_defaults", input);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(false);
    }
  }

  const label = (n: number) => (n >= 60 && n % 60 === 0 ? `${n / 60} min` : `${n}s`);

  return (
    <section className="card mb-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Rest between sets</h2>
        <span className="shrink-0 text-[13px] text-muted tabular">
          {defaultRestSeconds === null ? "As planned" : label(defaultRestSeconds)}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-faint">
        The timer that starts when you log a set. &ldquo;As planned&rdquo; uses whatever each
        movement was written with, which is usually ninety seconds.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Choice
          on={defaultRestSeconds === null}
          busy={busy}
          onClick={() => save({ seconds: null })}
        >
          As planned
        </Choice>
        {CHOICES.map((n) => (
          <Choice key={n} on={defaultRestSeconds === n} busy={busy} onClick={() => save({ seconds: n })}>
            {label(n)}
          </Choice>
        ))}
      </div>

      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-3 text-[12px] text-accent underline underline-offset-2"
      >
        {open
          ? "Hide the per-muscle ones"
          : custom > 0
            ? `Different for ${custom} muscle group${custom === 1 ? "" : "s"}`
            : "Set a different one per muscle group"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {REST_GROUPS.map((group) => {
            const value = groups[group] ?? null;
            return (
              <div key={group} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[13px]">{group}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Choice
                    small
                    on={value === null}
                    busy={busy}
                    onClick={() => {
                      // Cleared by rebuilding without it: the tool merges, so
                      // sending the group back would only ever set it.
                      const next = { ...groups };
                      delete next[group];
                      void save({ byGroup: Object.keys(next).length === 0 ? {} : next });
                    }}
                  >
                    Default
                  </Choice>
                  {CHOICES.map((n) => (
                    <Choice
                      key={n}
                      small
                      on={value === n}
                      busy={busy}
                      onClick={() => save({ byGroup: { [group]: n } })}
                    >
                      {label(n)}
                    </Choice>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] leading-relaxed text-faint">
            Anything between {MIN_REST_SECONDS} seconds and {MAX_REST_SECONDS / 60} minutes. Your
            coach can set any number in between if none of these fit.
          </p>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}

function Choice({
  on, busy, small, onClick, children,
}: {
  on: boolean; busy: boolean; small?: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={`rounded-full border tabular disabled:opacity-50 ${
        small ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-2 text-[13px]"
      } ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
    >
      {children}
    </button>
  );
}
