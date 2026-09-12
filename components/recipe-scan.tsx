"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { shrink } from "@/lib/shrink";

/**
 * A photo, turned into numbers she can log.
 *
 * Maria's request, from this screen: "let me add a photo of a recipe, and you
 * estimate the macros and calories for it." It has always read a plate of food
 * or a packet as happily as a recipe page — the model is told all three.
 *
 * It used to be a card of its own, with a heading and a paragraph, sitting
 * between the day's food and the calculator. It is a third way to add food and
 * it belongs where the other two are: a camera beside "Add food", which is
 * obvious enough in that row to need no explaining. The panel it opens is the
 * part that was ever worth the space.
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
  perServing: {
    calories: number; caloriesLow: number; caloriesHigh: number;
    proteinG: number; carbsG: number; fatG: number; fibreG: number | null;
  };
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
        description: estimate.servings > 1
          ? `${estimate.title} (1 of ${estimate.servings}, from a photo)`
          : `${estimate.title} (from a photo)`,
        caloriesLow: estimate.perServing.caloriesLow,
        caloriesHigh: estimate.perServing.caloriesHigh,
        proteinG: estimate.perServing.proteinG,
        carbsG: estimate.perServing.carbsG,
        fatG: estimate.perServing.fatG,
        // Only when the read produced one — unknown is not zero, here as
        // everywhere else.
        ...(estimate.perServing.fibreG === null ? {} : { fibreG: estimate.perServing.fibreG }),
      });
      setLogged(true);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't log."));
    } finally {
      setBusy(false);
    }
  }

  /*
    A button in the row, and everything else on the line under it.

    The parent is `flex flex-wrap`, so `basis-full` is what drops the panel
    onto its own line while the camera stays beside "Add food". No portal, no
    state lifted out of here — the row and the panel are still one component
    and still own their own photo.
  */
  return (
    <>
      {/*
        No `capture`. The button says "take or choose", and `capture` takes the
        choice away: iOS opens the camera directly and there is no way to reach
        the library from it. A recipe is very often a photo she already has —
        a screenshot of a page, a label photographed in a shop — so the one
        that mattered most was the one it refused.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label="Photograph your food"
        title="Photograph your food"
        className="grid w-12 shrink-0 place-items-center rounded-xl border border-dashed border-line text-muted transition-colors hover:text-accent active:bg-raised disabled:opacity-50"
      >
        {busy && !estimate ? (
          <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        )}
      </button>

      {busy && !estimate && (
        <p className="mt-2 basis-full text-[12px] text-muted">Reading it…</p>
      )}

      {error && (
        <p role="alert" className="mt-2 basis-full rounded-lg border border-miss/30 bg-miss-soft px-3 py-2 text-[12px] text-miss">
          {error}
        </p>
      )}

      {estimate && (
        <div className="mt-2 basis-full space-y-3 rounded-xl border border-line bg-raised p-3">
          <div className="flex gap-3">
            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element -- data URI held in memory for this one screen; nothing is stored */
              <img src={preview} alt="" className="size-16 shrink-0 rounded-lg border border-line object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{estimate.title}</p>
              {/* A plate is not a recipe that "makes one serving". */}
              {estimate.servings > 1 && (
                <p className="text-[12px] text-muted">Makes {estimate.servings} servings</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line px-3 py-2.5">
            <p className="text-[12px] uppercase tracking-wide text-faint">
              {estimate.servings > 1 ? "Per serving" : "This plate"}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
              {estimate.perServing.caloriesLow}–{estimate.perServing.caloriesHigh} kcal
            </p>
            <p className="mt-0.5 text-[12px] tabular-nums text-muted">
              {estimate.perServing.proteinG}g protein · {estimate.perServing.carbsG}g carbs · {estimate.perServing.fatG}g fat
              {estimate.perServing.fibreG !== null && ` · ${estimate.perServing.fibreG}g fibre`}
            </p>
          </div>

          <p className="text-[13px] leading-relaxed text-muted">{estimate.note}</p>
          {/* Kept visible even though the card around it is gone: whether a
              photo of her dinner is stored is a real question, and the answer
              belongs where the photo is, not in a policy page. */}
          <p className="text-[11px] text-faint">An estimate, not a lookup. The photo is not kept.</p>

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
    </>
  );
}
