"use client";

import { useState } from "react";
import { PRO_PRICE } from "@/lib/tier-prices";

/**
 * Free or Pro, and the way across.
 *
 * Both buttons hand her to a Stripe-hosted page — nothing about a card is
 * ever ours — and what she is entitled to is written by Stripe's webhook,
 * never by anything this button says. Comped accounts see a line, not a
 * sale. The wrapped store apps must never show this card: Apple's rules
 * allow using a subscription bought elsewhere, not selling one in-app.
 */
export function GoPro({ tier, comped, status, welcome }: {
  tier: "free" | "pro"; comped: boolean; status: string | null; welcome: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string, body?: object) {
    setBusy(path); setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) { window.location.assign(data.url); return; }
      setError(data.error ?? "Something went wrong.");
    } catch { setError("Couldn't reach the server."); }
    finally { setBusy(null); }
  }

  if (comped) {
    return (
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Sore Winner Pro</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">Everything on, on the house.</p>
      </section>
    );
  }
  if (tier === "pro") {
    return (
      <section className="card mb-3 p-5">
        <h2 className="text-[15px] font-semibold">Sore Winner Pro</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {welcome ? "Welcome aboard. " : ""}{status === "trialing" ? "You're on the free trial. " : status === "past_due" ? "The last payment didn't go through — update your card to keep Pro. " : ""}
          Change plan, update your card or cancel any time.
        </p>
        <button type="button" onClick={() => void go("/api/billing/portal")} disabled={busy !== null}
          className="mt-3 rounded-xl border border-line px-4 py-3 text-[14px] font-medium text-text disabled:opacity-50">
          {busy ? "Opening…" : "Manage subscription"}
        </button>
        {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
      </section>
    );
  }
  return (
    <section className="card mb-3 p-5" data-go-pro="">
      <h2 className="text-[15px] font-semibold">Sore Winner Pro</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        The whole coach: weeks written for you, meal plans, the kitchen and shopping list, photos read,
        food worked out when it isn&apos;t in the library, and as much conversation as a day needs.
        {PRO_PRICE.trialDays} days free, then {PRO_PRICE.monthly} a month or {PRO_PRICE.yearly} a year.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void go("/api/billing/checkout", { plan: "monthly" })} disabled={busy !== null}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-[14px] font-semibold text-on-accent disabled:opacity-50">
          {busy ? "Opening…" : `${PRO_PRICE.monthly}/month`}
        </button>
        <button type="button" onClick={() => void go("/api/billing/checkout", { plan: "yearly" })} disabled={busy !== null}
          className="flex-1 rounded-xl border border-accent px-4 py-3 text-[14px] font-semibold text-accent disabled:opacity-50">
          {busy ? "Opening…" : `${PRO_PRICE.yearly}/year`}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-faint">Cancel any time. Everything you have logged stays yours either way.</p>
      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
