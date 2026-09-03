"use client";

import { startTransition, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";

/**
 * A nudge to stand on the scale, at an hour she picks.
 *
 * Two separate things have to be true and the card says which is missing:
 * the device has to allow notifications, and there has to be an hour set. It
 * is the pair that trips people up — allowing notifications and then never
 * getting one, or picking a time on a phone that was never asked.
 *
 * An hour, not a time. The reminder is sent by a scheduled sweep, and how
 * often that runs is the hosting plan's decision rather than hers — so the
 * rule is "her hour has come and she has not been nudged today", which gives
 * one notification a day whatever the schedule. On a plan that sweeps hourly
 * it arrives within the hour she picked; on one that sweeps daily it arrives
 * at the sweep. Offering 07:42 would be offering something neither can keep.
 *
 * It only ever fires on a day she has not already weighed in. A reminder to
 * do something you have done is how notifications get switched off.
 */
const HOURS = [5, 6, 7, 8, 9, 10, 12, 17, 18, 19, 20, 21];

/** Whether this browser can do notifications at all. Read, not stored. */
const noop = () => () => {};
const usePermission = () =>
  useSyncExternalStore(
    noop,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );

export function WeighInReminder({
  hour, vapidPublicKey,
}: {
  hour: number | null;
  /** Empty when the deployment has no push keys — then this cannot work. */
  vapidPublicKey: string;
}) {
  const router = useRouter();
  const permission = usePermission();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (h: number) => {
    const suffix = h < 12 ? "am" : "pm";
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return `${twelve}${suffix}`;
  };

  async function setHour(next: number | null) {
    setBusy(true);
    setError(null);
    try {
      if (next !== null && permission !== "granted") await allow();
      await action("set_weigh_in_reminder", { hour: next });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(actionMessage(err, "That didn't save — try again."));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ask the device, then hand the subscription to the server.
   *
   * The subscription is minted by the browser — an endpoint the push service
   * issued and two keys — which is why the tool that stores it is one the
   * model cannot call. Deciding *whether* to be reminded is hers and the
   * coach's; producing this is neither's.
   */
  async function allow() {
    if (!vapidPublicKey) throw new Error("Notifications are not set up on this deployment yet.");
    if (typeof Notification === "undefined") throw new Error("This browser cannot do notifications.");

    const granted = await Notification.requestPermission();
    if (granted !== "granted") {
      throw new Error(
        granted === "denied"
          ? "Notifications are blocked for this app. Allow them in your browser or phone settings and try again."
          : "Notifications weren't allowed.",
      );
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      // Required, and true is the only honest value: every push this app
      // sends shows a notification.
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    });

    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("That browser gave an incomplete subscription.");
    }
    await action("save_push_device", {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
  }

  return (
    <section className="card mb-3 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Weigh-in reminder</h2>
        <span className="shrink-0 text-[13px] text-muted tabular">
          {hour === null ? "Off" : label(hour)}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-faint">
        One notification a day, once the hour you pick has come round, and only on a day you
        haven&rsquo;t already weighed in. Weight is the one number the whole plan is worked out
        from, and the reason people stop logging it is forgetting rather than minding.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setHour(null)}
          disabled={busy}
          aria-pressed={hour === null}
          className={`rounded-full border px-3.5 py-2 text-[13px] disabled:opacity-50 ${
            hour === null ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
          }`}
        >
          Off
        </button>
        {HOURS.map((h) => (
          <button
            key={h}
            onClick={() => setHour(h)}
            disabled={busy}
            aria-pressed={hour === h}
            className={`rounded-full border px-3.5 py-2 text-[13px] tabular disabled:opacity-50 ${
              hour === h ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            }`}
          >
            {label(h)}
          </button>
        ))}
      </div>

      {/* The two things that have to be true, and which one is not. */}
      {!vapidPublicKey && (
        <p className="mt-3 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2 text-[12px] leading-relaxed text-hold">
          Notifications are not configured on this deployment yet, so nothing will be sent.
          Run <code>npm run vapid</code> and add the keys it prints.
        </p>
      )}
      {vapidPublicKey && hour !== null && permission === "denied" && (
        <p className="mt-3 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2 text-[12px] leading-relaxed text-hold">
          This device is blocking notifications, so the reminder is set but will not arrive.
          Allow them for this app in your browser or phone settings.
        </p>
      )}
      {vapidPublicKey && hour !== null && permission === "default" && (
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Pick the time again to let this device ask permission.
        </p>
      )}
      {vapidPublicKey && hour !== null && permission === "granted" && (
        <p className="mt-3 text-[12px] text-faint">
          This device will get it. On iPhone that only works from the installed app, not Safari.
        </p>
      )}

      {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
    </section>
  );
}
