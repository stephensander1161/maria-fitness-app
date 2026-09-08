"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { shrink } from "@/lib/shrink";

/**
 * A photo of a recipe, turned into numbers she can log.
 *
 * Maria's request, from this screen: "let me add a photo of a recipe, and you
 * estimate the macros and calories for it."
 *
 * Two things it deliberately does not do. It does not keep the photo — the
 * bytes go with the request and there is no row and no blob afterwards, which
 * is why nothing here shows a gallery. And it does not log anything by
 * itself: the estimate arrives with its range and its assumptions on the
 * screen, and the numbers only land when she taps Log. An app that quietly
 * wrote a number it admits it is unsure of into her day is one she stops
 * trusting with the days it *is* sure about.
 */
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Slot = (typeof SLOTS)[number];

type Estimate = {
  ok: true;
  title: string;
  servings: number;
  perServing: { calories: number; caloriesLow: number; caloriesHigh: number; proteinG: number; carbsG: number; fatG: number };
  assumptions: string[];
  note: string;
};

export function RecipeScan({ defaultSlot }: { defaultSlot: Slot }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [slot, setSlot] = useState<Slot>(defaultSlot);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setEstimate(null);
    setLogged(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    setEstimate(null);
    setLogged(false);
    try {
      const small = await shrink(file);
      setPreview(small.src);
      const got = await action<Estimate | { ok: false; error: string }>(
        "estimate_recipe_from_photo", { image: small.src },
      );
      if (!got.ok) {
        setError(got.error);
        return;
      }
      setEstimate(got);
    } catch (err) {
      setError(actionMessage(err, "Couldn't read that photo."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ""; // so the same photo can be re-picked
    }
  }

  async function log() {
    if (!estimate) return;
    setBusy(true);
    setError(null);
    try {
      // The range travels, not a false single number — log_meal logs the
      // midpoint and keeps the bounds, the same as a restaurant meal.
      await action("log_meal", {
        slot,
        description: `${estimate.title} (1 of ${estimate.servings}, from a photo)`,
        caloriesLow: estimate.perServing.caloriesLow,
        caloriesHigh: estimate.perServing.caloriesHigh,
        proteinG: estimate.perServing.proteinG,
        carbsG: estimate.perServing.carbsG,
        fatG: estimate.perServing.fatG,
      });
      setLogged(true);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't log."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Scan a recipe</h2>
        <span className="shrink-0 text-[11px] text-faint">Estimate, not a lookup</span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        A recipe page, a label, or the plate itself. You get calories and macros per serving,
        with what they assume. The photo is not kept.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }}
      />

      {!estimate && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-edge py-3 text-[14px] font-medium text-text active:bg-raised disabled:opacity-50"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {busy ? "Reading it…" : "Take or choose a photo"}
        </button>
      )}

      {busy && !estimate && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
          Reading the recipe…
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">
          {error}
        </p>
      )}

      {estimate && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-3">
            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element -- data URI held in memory for this one screen; nothing is stored */
              <img src={preview} alt="" className="size-16 shrink-0 rounded-lg border border-line object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{estimate.title}</p>
              <p className="text-[12px] text-muted">
                Makes {estimate.servings}{estimate.servings === 1 ? " serving" : " servings"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-line px-3 py-2.5">
            <p className="text-[12px] uppercase tracking-wide text-faint">Per serving</p>
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
              {estimate.perServing.caloriesLow}–{estimate.perServing.caloriesHigh} kcal
            </p>
            <p className="mt-0.5 text-[12px] tabular-nums text-muted">
              {estimate.perServing.proteinG}g protein · {estimate.perServing.carbsG}g carbs · {estimate.perServing.fatG}g fat
            </p>
          </div>

          <p className="text-[13px] leading-relaxed text-muted">{estimate.note}</p>

          {estimate.assumptions.length > 0 && (
            /* The assumptions are the point: she can correct the one that is
               wrong, which she cannot do with a bare number. */
            <ul className="space-y-1 text-[12px] leading-relaxed text-faint">
              {estimate.assumptions.map((a, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden>·</span>{a}</li>
              ))}
            </ul>
          )}

          {logged ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-hit">Logged as {slot}.</p>
              <button type="button" onClick={reset} className="text-[13px] text-muted underline underline-offset-2">
                Scan another
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={slot === s}
                    className={`rounded-full border px-3 py-1 text-[13px] capitalize ${
                      slot === s ? "border-accent bg-accent-soft text-accent" : "border-edge text-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={log}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-on-accent disabled:opacity-50"
                >
                  {busy ? "Logging…" : "Log one serving"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="rounded-xl border border-edge px-4 text-[14px] text-muted disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
