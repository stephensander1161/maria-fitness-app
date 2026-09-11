"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * What she has drunk, and three buttons to add to it.
 *
 * One tap per glass, because that is the only interaction anybody will do
 * eight times a day. Typing an amount is there for the times it is not a
 * glass, and undo is there because the eighth tap of the day is the one that
 * lands twice.
 *
 * The bar never fills from nothing: a day with no rows shows no verdict at
 * all, because a day nobody wrote down is not a dry day — the house rule, and
 * the one this feature would be easiest to get wrong.
 */
export function WaterCard({
  total, target, state, units, date, isToday, anythingLogged, presets,
}: {
  /*
    The vessels, chosen and named on the server.

    Not imported from lib/water.ts: that module reads the database, and a
    client component importing it drags `postgres` into the browser bundle —
    which is exactly what it did. The server already knows her units, so it
    picks the labels too and this file needs nothing but the list.
  */
  presets: { ml: number; label: string }[];
  /** Already formatted in her units, or null for nothing logged. */
  total: string | null;
  target: string;
  state: "none" | "low" | "close" | "there" | "unknown";
  units: "metric" | "imperial";
  date: string;
  isToday: boolean;
  anythingLogged: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  async function add(amount: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      await action("log_water", { amount, date });
      setTyped("");
      setTyping(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    setBusy("undo");
    setError(null);
    try {
      await action("remove_water_log", { date });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "Couldn't take that back — try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mb-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{isToday ? "Water today" : "Water that day"}</h2>
        <p className="shrink-0 text-[12px] text-faint tabular">
          {/* The target beside the total, never instead of it. */}
          {anythingLogged ? `${total} of ${target}` : `target ${target}`}
        </p>
      </div>

      {anythingLogged ? (
        <p className={`mt-1 text-[13px] ${
          state === "there" ? "text-beat" : state === "low" ? "text-muted" : "text-muted"
        }`}>
          {state === "there"
            ? "That is the day's target — anything else is a bonus."
            : state === "close"
              ? "Nearly there."
              : "Keep going."}
        </p>
      ) : (
        // Not "0 ml". A day nobody wrote down is not a day she drank nothing,
        // and starting the bar at empty is the app calling it a miss.
        <p className="mt-1 text-[13px] leading-relaxed text-faint">
          Nothing written down {isToday ? "yet today" : "for that day"} — which is not the same as
          nothing drunk. Tap a glass as you go.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.ml}
            onClick={() => add(`${p.ml}ml`, String(p.ml))}
            disabled={busy !== null}
            className="flex-1 rounded-xl border border-edge py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-raised active:bg-raised disabled:opacity-40"
          >
            {busy === String(p.ml) ? "…" : `+ ${p.label}`}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!typing ? (
          <button
            onClick={() => setTyping(true)}
            className="rounded-full px-2 py-1 text-[12px] text-faint underline underline-offset-2"
          >
            Something else
          </button>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void add(typed.trim(), "typed"); }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={units === "imperial" ? "16oz, a pint, 2 cups" : "330ml, 1.5L, 2 glasses"}
              aria-label="How much you drank"
              className="min-w-0 flex-1 rounded-lg border border-edge bg-base px-3 py-2 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy !== null || !typed.trim()}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted disabled:opacity-40"
            >
              {busy === "typed" ? "…" : "Add"}
            </button>
          </form>
        )}
        {anythingLogged && !typing && (
          <button
            onClick={undo}
            disabled={busy !== null}
            className="ml-auto rounded-full px-2 py-1 text-[12px] text-faint underline underline-offset-2 disabled:opacity-40"
          >
            {busy === "undo" ? "…" : "Undo last"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-[12px] text-miss">{error}</p>}
    </section>
  );
}
