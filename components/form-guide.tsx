"use client";

import { useEffect, useState } from "react";
import { action } from "@/lib/client";

type Guide = {
  name: string;
  primaryMuscles: string[];
  equipment: string[];
  formCues: string[];
  commonMistakes: string[];
  safetyNote: string | null;
  easier: string[];
  harder: string[];
  error?: string;
};

/**
 * Form and technique, in a sheet rather than a page.
 *
 * It used to link to /learn/<slug>, which meant leaving the workout to check a
 * cue and navigating back. Mid-set, that is the difference between checking and
 * not bothering.
 */
export function FormGuide({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    action<Guide>("get_exercise_guide", { slug })
      .then((g) => (g?.error ? setFailed(true) : setGuide(g)))
      .catch(() => setFailed(true));
  }, [slug]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/70 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold">{guide?.name ?? name}</h2>
            {guide && (
              <p className="mt-0.5 text-[12px] text-faint">
                {guide.primaryMuscles.join(" · ")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-[13px] text-muted">Close</button>
        </div>

        {failed && <p className="py-6 text-center text-[14px] text-muted">Couldn&apos;t load that.</p>}

        {!guide && !failed && (
          <div className="flex justify-center gap-1.5 py-8">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}

        {guide && (
          <div className="space-y-5">
            {guide.safetyNote && (
              <div className="rounded-xl border border-hold/30 bg-hold-soft p-3.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-hold">
                  Worth knowing
                </p>
                <p className="text-[13px] leading-relaxed">{guide.safetyNote}</p>
              </div>
            )}

            <section>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
                How to do it
              </h3>
              <ol className="space-y-2.5">
                {guide.formCues.map((cue, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent tabular">
                      {i + 1}
                    </span>
                    <span className="text-[14px] leading-relaxed">{cue}</span>
                  </li>
                ))}
              </ol>
            </section>

            {guide.commonMistakes.length > 0 && (
              <section>
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
                  Common mistakes
                </h3>
                <ul className="space-y-2">
                  {guide.commonMistakes.map((m, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-miss" />
                      <span className="text-[13px] leading-relaxed text-muted">{m}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
