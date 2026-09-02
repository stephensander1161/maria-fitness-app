"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * What she actually burns, measured from her own logs.
 *
 * Deliberately a button rather than a number on the screen: this is arithmetic
 * over three weeks of data, and showing it unprompted invites her to read a
 * new number every morning — which is the behaviour that makes people miserable
 * about food. It answers a question when she asks it.
 *
 * Nothing changes until she taps to accept. An app that silently moves the
 * number she eats to is one she stops trusting.
 */
type Result = {
  canMeasure: boolean;
  why?: string;
  daysCounted: number;
  windowDays: number;
  measuredExpenditure?: number;
  formulaSaid?: number;
  meanIntake?: number | null;
  weightChange?: number | null;
  weightUnit?: string;
  currentTarget: number | null;
  proposedTarget?: number;
  proposedProteinG?: number;
  expectedRate?: string;
  limitedBy?: "bmr" | "floor" | "rate" | null;
  note?: string;
};

export function CheckIn() {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      setResult(await action<Result>("run_check_in"));
    } catch (err) {
      setError(actionMessage(err, "Couldn't work that out just now."));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!result?.proposedTarget) return;
    setApplying(true);
    setError(null);
    try {
      await action("set_nutrition_targets", {
        calorieTarget: result.proposedTarget,
        proteinTargetG: result.proposedProteinG,
      });
      setApplied(true);
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't save."));
    } finally {
      setApplying(false);
    }
  }

  const changed =
    result?.proposedTarget !== undefined &&
    result.currentTarget !== null &&
    Math.abs(result.proposedTarget - result.currentTarget) >= 75;

  return (
    <section className="card mb-3 p-5">
      <h2 className="text-[15px] font-semibold">What you actually burn</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Measured from three weeks of your own food logs and weigh-ins, rather than the formula that
        set your first target — that one was an average of other people, and it drifts as you lose.
      </p>

      {!result && (
        <button
          onClick={run}
          disabled={busy}
          className="mt-3 rounded-full border border-line px-4 py-2 text-[13px] text-accent disabled:opacity-40"
        >
          {busy ? "Working it out…" : "Check in"}
        </button>
      )}

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}

      {result && !result.canMeasure && (
        <div className="mt-3 rounded-xl border border-line bg-raised p-3.5">
          <p className="text-[13px] leading-relaxed text-muted">{result.why}</p>
          <p className="mt-2 text-[12px] text-faint">
            {result.daysCounted} of {result.windowDays} days fully counted. Nothing has changed.
          </p>
        </div>
      )}

      {result?.canMeasure && (
        <div className="mt-3 space-y-3">
          <div className="flex divide-x divide-line">
            <Stat label="You burn" value={`${result.measuredExpenditure}`} sub="kcal a day" />
            <Stat label="The formula said" value={`${result.formulaSaid}`} sub="kcal a day" />
          </div>

          <p className="text-[12px] leading-relaxed text-faint">
            From {result.daysCounted} counted days at {result.meanIntake} kcal, and a trend weight
            change of {result.weightChange}{result.weightUnit} over three weeks.
          </p>

          <div className="rounded-xl border border-line bg-raised p-3.5">
            <p className="text-[14px]">
              {result.currentTarget === null
                ? `Suggested target: ${result.proposedTarget} kcal a day`
                : changed
                  ? `Suggested: ${result.currentTarget} → ${result.proposedTarget} kcal a day`
                  : `Your ${result.currentTarget} kcal target is holding up — nothing to change.`}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {result.note} {result.expectedRate && `Roughly ${result.expectedRate}.`}
            </p>
            {result.limitedBy === "bmr" && (
              <p className="mt-2 text-[12px] text-hold">
                That&rsquo;s the floor: what you burn at rest. Under it you lose muscle and bone, not fat.
              </p>
            )}
          </div>

          {(changed || result.currentTarget === null) && !applied && (
            <button
              onClick={accept}
              disabled={applying}
              className="rounded-full bg-accent px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-40"
            >
              {applying ? "Saving…" : `Use ${result.proposedTarget} kcal`}
            </button>
          )}
          {applied && (
            <p className="text-[13px] text-beat">
              Target updated. Your meals for this week are untouched.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const Stat = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <div className="flex-1 px-3 first:pl-0 last:pr-0">
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <p className="text-2xl font-semibold tabular">{value}</p>
    <p className="text-[11px] text-faint">{sub}</p>
  </div>
);
