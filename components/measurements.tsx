"use client";

import { startTransition, useState } from "react";
import { Sparkline } from "./sparkline";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { SITES, siteHow } from "@/lib/measurements";
import { prettyDate } from "@/lib/date";
import type { SiteProgress } from "@/lib/progress";

export function Measurements({ sites, unit }: { sites: SiteProgress[]; unit: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHow, setShowHow] = useState<string | null>(null);
  const [chart, setChart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Remove one reading. The tape moving is the usual reason a point is odd. */
  async function drop(site: string, date: string) {
    setBusy(true);
    setError(null);
    try {
      await action("remove_measurement", { site, date });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "Couldn't remove that reading."));
    } finally {
      setBusy(false);
    }
  }

  const tracked = new Map(sites.map((s) => [s.site, s]));

  async function save() {
    // `32.5"`, `32,5`, `32 in` — a tape measure gets read out loud, not typed
    // like a form field. Strip what she plausibly types rather than dropping
    // the reading on the floor.
    const parse = (raw: string) => Number(raw.trim().replace(/["'\s]|in$|cm$/gi, "").replace(",", "."));
    const typed = Object.entries(values).filter(([, raw]) => raw.trim() !== "");
    const entries = typed
      .map(([site, raw]) => ({ site, value: parse(raw) }))
      .filter((e) => e.value > 0 && Number.isFinite(e.value));

    if (entries.length === 0) {
      // It used to return silently: she measured herself with a tape, tapped
      // Save, and nothing happened and nothing said why.
      setError(typed.length === 0
        ? "Nothing to save yet — type a measurement first."
        : "That didn't look like a number. Try just the digits, like 32.5.");
      return;
    }
    // Reported *after* the save, or the reset below would wipe it.
    const dropped = typed.length - entries.length;

    setSaving(true);
    setError(null);
    try {
      await action("log_measurement", { measurements: entries });
      setValues({});
      setOpen(false);
      if (dropped > 0) {
        setError(`Saved ${entries.length}. ${dropped} didn't look like a number and ${dropped === 1 ? "was" : "were"} left out.`);
      }
      router.refresh();
    } catch (err) {
      // She has just measured herself with a tape. Losing that silently means
      // doing it again, and she will not.
      setError(actionMessage(err, "Those measurements didn't save — try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Measurements</h2>
        {!open && (
          <button onClick={() => setOpen(true)} className="-my-2 px-3 py-2 text-[13px] text-accent">
            {sites.length ? "Add" : "Start"}
          </button>
        )}
      </div>

      {sites.length === 0 && !open && (
        <p className="text-[13px] leading-relaxed text-faint">
          The scale misses a lot. Waist is the one worth tracking weekly — it keeps
          moving even in weeks the scale sits still.
        </p>
      )}

      {sites.length > 0 && (
        <ul className="space-y-2.5">
          {sites.map((s) => (
            <li key={s.site}>
              <button
                onClick={() => setChart(chart === s.site ? null : s.site)}
                aria-expanded={chart === s.site}
                className="flex w-full items-baseline justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="text-[15px]">{s.label}</p>
                  <p className="text-[11px] text-faint">
                    {s.history.length} reading{s.history.length === 1 ? "" : "s"}
                    {s.currentDate && ` · latest ${s.currentDate}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[17px] font-semibold tabular">
                    {s.current}
                    <span className="ml-0.5 text-[12px] font-normal text-faint">{unit}</span>
                  </p>
                  {s.changeTotal !== null && s.changeTotal !== 0 && (
                    // Losing inches is the goal, so a decrease is highlighted.
                    // An increase is left neutral — a bigger arm is not bad news.
                    <p className={`text-[12px] tabular ${s.changeTotal < 0 ? "text-beat" : "text-muted"}`}>
                      {s.changeTotal < 0 ? "−" : "+"}
                      {Math.abs(s.changeTotal)}
                      {unit} total
                    </p>
                  )}
                </div>
              </button>
              {/*
                The chart is a tap, not a permanent fixture.
                A tape measure is the one instrument that shows recomposition
                — weight flat while the waist comes down — so the line matters;
                but seven of them stacked is a wall, and a site with one
                reading has no line to draw at all. Opening it says which of
                those two it is rather than showing nothing.
              */}
              {chart === s.site && (
                <div className="mt-1 rounded-xl border border-line bg-raised p-3">
                  {s.history.length > 1 ? (
                    <>
                      <Sparkline points={[...s.history].reverse().map((h) => h.value)} goal={null} />
                      <p className="mt-1 text-center text-[11px] text-faint tabular">
                        {s.first}{unit} on {s.firstDate} → {s.current}{unit} on {s.currentDate}
                      </p>
                    </>
                  ) : (
                    <p className="text-center text-[12px] leading-relaxed text-faint">
                      One reading so far — a line needs two. Measure again whenever you like; the
                      comparison worth having is weeks apart, not this morning against last night.
                    </p>
                  )}

                  {/*
                    Every reading, with a way to remove one.
                    A chart with no numbers under it is a shape she has to
                    take on trust, and a tape measure held differently is the
                    single most likely reason a point is wrong — so the fix
                    has to be here, next to the point that looks odd.
                    Re-measuring the same day overwrites rather than stacking,
                    which is why editing is just measuring again.
                  */}
                  <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
                    {s.history.map((h) => (
                      <li key={h.date} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="text-[12px] text-muted tabular">{prettyDate(h.date)}</span>
                        <span className="text-[13px] tabular">{h.value}{unit}</span>
                        <button
                          onClick={() => void drop(s.site, h.date)}
                          disabled={busy}
                          aria-label={`Remove the ${s.label} reading from ${h.date}`}
                          className="-my-1 grid size-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-surface hover:text-miss disabled:opacity-40"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    Measuring the same site again on the same day replaces that reading — so
                    correcting one is just measuring it again.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] leading-relaxed text-faint">
            Fill in whatever you measured — leave the rest blank. Same time of day
            each week, before eating.
          </p>

          {SITES.map((site) => {
            const previous = tracked.get(site.key);
            return (
              <div key={site.key}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHow(showHow === site.key ? null : site.key)}
                    className="flex-1 text-left text-[14px]"
                  >
                    {site.label}
                    <span className="ml-1.5 text-[11px] text-faint">
                      {previous ? `last ${previous.current}${unit}` : "how?"}
                    </span>
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={values[site.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [site.key]: e.target.value }))}
                    placeholder={unit}
                    // Four identical "in, text field" announcements in a row is
                    // four numbers saved against the wrong four sites. The site
                    // name is in a sibling button, so it has to be said here.
                    aria-label={`${site.label} in ${unit}`}
                    className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-center text-[15px] tabular placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
                {showHow === site.key && (
                  <p className="mt-1.5 rounded-lg bg-raised px-3 py-2 text-[12px] leading-relaxed text-muted">
                    {siteHow(site.key)}
                  </p>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => { setOpen(false); setValues({}); }}
              className="rounded-xl border border-line py-3 text-[14px] text-muted"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || Object.values(values).every((v) => !v)}
              className="rounded-xl bg-accent py-3 text-[14px] font-semibold text-on-accent disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-center text-[13px] text-miss">{error}</p>}
        </div>
      )}
    </section>
  );
}
