"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
import { prettyDate } from "@/lib/date";
import type { HighFiveTally } from "@/lib/friends";
import type { FriendCard } from "@/app/friends/page";

type Edge = { friendshipId: string; name: string; state: string };

/**
 * The friends screen's moving parts.
 *
 * Two rules it exists to hold:
 *
 * - **Nothing here reads as her failure.** A quiet week is "nothing logged
 *   this week", not a zero next to someone else's four, and a friend who has
 *   never started says so rather than looking like someone who stopped. Same
 *   rule as the rest of the app: absence is not a measurement.
 * - **Every failure is announced.** Every write goes through action() and every
 *   one of them can say it did not work, out loud, with role="alert".
 *
 * The order is the third thing, and it was wrong on the first pass: her own
 * code and the add-a-friend form sat above the people she actually has, so
 * the screen opened on setup she had already done. Setup is a thing you need
 * once and the friends are the thing you came for, so the friends are first
 * and the code is at the bottom.
 */
export function FriendsClient({
  myCode, friends, waitingOnYou, waitingOnThem, highFives,
}: {
  myCode: string;
  friends: FriendCard[];
  waitingOnYou: Edge[];
  waitingOnThem: Edge[];
  highFives: HighFiveTally;
}) {
  const router = useRouter();
  // Read from the count the screen was *rendered* with and held in state, so a
  // refresh cannot start it a second time. Arriving to a cheer should happen
  // once; one that replays on every revalidation is a notification that will
  // not go away.
  const [cheering, setCheering] = useState(() => highFives.unseen.count > 0);
  // Seen the moment she opens the screen — the unseen count is "since you last
  // looked", so looking is what clears it. The per-friend totals underneath are
  // a different number and never clear.
  useEffect(() => {
    if (highFives.unseen.count > 0) void action("acknowledge_high_fives", {}).catch(() => {});
  }, [highFives.unseen.count]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * A tool that *refuses* comes back as `{ ok: false, error }` — it does not
   * throw, because the request itself succeeded. Catching only the exception
   * therefore treated every refusal as a success and refreshed the screen
   * with nothing changed, which is precisely the silent-failure this project
   * has a rule against. Both shapes are handled here, in one place.
   */
  async function run(key: string, fn: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const res = (await fn()) as { ok?: boolean; error?: string } | null;
      if (res && res.ok === false) { setError(res.error ?? fallback); return; }
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy("add");
    setError(null);
    setNote(null);
    try {
      const res = await action<{ ok: boolean; error?: string; note?: string }>("add_friend", { code });
      // A refused code is a result, not a thrown error — it comes back as
      // ok:false and has to be shown, or the form silently does nothing.
      if (!res.ok) { setError(res.error ?? "That code didn't work."); return; }
      setCode("");
      setNote(res.note ?? "Asked.");
      router.refresh();
    } catch (err) {
      setError(actionMessage(err, "That didn't send — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen to read anyway.
      setError("Couldn't copy it — the code is above, you can read it out.");
    }
  }

  return (
    <div className="space-y-3">
      {cheering && (
        <HighFiveCheer unseen={highFives.unseen} onDone={() => setCheering(false)} />
      )}

      {/*
        Two columns on a wide screen: the people, and the paperwork.

        It was one stack of full-width cards — a request, the friends, another
        request, a code box, a form — each a different height, running down the
        middle of a 1400px screen with nothing beside them. The friends are the
        page; adding one and handing out your code are the things you do once
        and then never again, so they go in a narrower column beside them
        rather than below them at the same weight.
      */}
      <div className="xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] xl:items-start xl:gap-4">
      <div className="space-y-3">

      {/* Above the friends, and only when somebody is actually waiting: it is
          one line that wants an answer and disappears once it has one. */}
      {waitingOnYou.length > 0 && (
        <section className="card border-accent/40 p-5">
          <h2 className="text-[15px] font-semibold">Waiting on you</h2>
          <ul className="mt-3 space-y-2">
            {waitingOnYou.map((r) => (
              <li key={r.friendshipId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px]">{r.name} wants to share training</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => run(r.friendshipId, () =>
                      action("respond_to_friend_request", { friendshipId: r.friendshipId, accept: true }),
                      "Couldn't accept that.")}
                    disabled={busy === r.friendshipId}
                    className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-on-accent disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => run(r.friendshipId, () =>
                      action("respond_to_friend_request", { friendshipId: r.friendshipId, accept: false }),
                      "Couldn't decline that.")}
                    disabled={busy === r.friendshipId}
                    className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted disabled:opacity-50"
                  >
                    No thanks
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* An empty state, never a card that vanishes: a section that disappears
          is indistinguishable from one that is broken. */}
      {friends.length === 0 ? (
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">This week</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Nobody yet. Send someone your code, or add theirs below, and you will both see
            sessions, streaks and best lifts here.
          </p>
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {friends.map((f) => (
            <FriendWeek
              key={f.friendshipId}
              friend={f}
              tally={highFives.byFriendship[f.friendshipId] ?? { got: 0, sent: 0 }}
              busy={busy === f.friendshipId}
              onRemove={() => run(f.friendshipId, () =>
                action("remove_friend", { friendshipId: f.friendshipId }),
                "Couldn't remove them.")}
            />
          ))}
        </div>
      )}

      {waitingOnThem.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Waiting on them</h2>
          <ul className="mt-3 space-y-2">
            {waitingOnThem.map((r) => (
              <li key={r.friendshipId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] text-muted">You asked {r.name}</span>
                <button
                  onClick={() => run(r.friendshipId, () =>
                    action("remove_friend", { friendshipId: r.friendshipId }), "Couldn't cancel that.")}
                  disabled={busy === r.friendshipId}
                  className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      </div>

      {/* The paperwork. Sticky, because the friends column is the one that
          gets long. */}
      <aside className="mt-3 space-y-3 xl:mt-0 xl:sticky xl:top-6">

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Add a friend</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Type the code they gave you. They see your training once you have both agreed.
        </p>
        <form onSubmit={add} className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="4RJ2-K8QW"
            aria-label="Their friend code"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-edge bg-base px-4 py-2.5 font-mono text-[15px] tracking-widest placeholder:text-faint placeholder:tracking-normal focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy === "add" || !code.trim()}
            className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-accent disabled:opacity-40"
          >
            {busy === "add" ? "Asking…" : "Ask"}
          </button>
        </form>
        {note && <p className="mt-2 text-[13px] text-beat">{note}</p>}
        {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Your friend code</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Give this to someone and they can ask to see your training. It is not your email
          address, and nobody can reach you without it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-xl border border-edge bg-base px-4 py-2.5 font-mono text-[17px] tracking-widest">
            {myCode}
          </code>
          <button
            onClick={copy}
            className="rounded-xl border border-line px-3.5 py-2.5 text-[13px] text-muted transition-colors hover:bg-raised"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => run("reset", () => action("reset_share_code"), "Couldn't change your code.")}
            disabled={busy === "reset"}
            className="rounded-xl px-3 py-2.5 text-[13px] text-faint transition-colors hover:text-muted disabled:opacity-50"
          >
            {busy === "reset" ? "Changing…" : "New code"}
          </button>
        </div>
      </section>

      {/* The rule this whole feature is built to keep, where it is read: in
          the column that is about handing somebody access. */}
      <p className="px-1 pt-1 text-[12px] leading-relaxed text-faint">
        Friends see training only: sessions, streak, sets and best lifts. Never your weight,
        measurements, photos, food or anything you tell your coach.
      </p>
      </aside>
      </div>
    </div>
  );
}

/**
 * The one-time celebration for high fives that arrived while she was away.
 *
 * Full screen and deliberately brief: it is a moment, not a message. The
 * message is the stamp on the friend's card, which is still there tomorrow —
 * so this can be over in three seconds without anything being lost, and it
 * dismisses on a tap or Escape for anyone who does not want to wait.
 *
 * `role="status"` rather than a dialog, because there is nothing to answer:
 * announcing it as modal would tell a screen reader the page behind is inert
 * when it is about to be, again, on its own.
 */
function HighFiveCheer({
  unseen, onDone,
}: {
  unseen: { count: number; from: string[] };
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // The timers below are set once and must not restart when the parent
  // re-renders, so the callback is read through a ref the effects keep
  // current rather than through the dependency list.
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    const out = window.setTimeout(() => setLeaving(true), 2600);
    const gone = window.setTimeout(() => done.current(), 3100);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") done.current(); };
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(gone);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const who = unseen.from.slice(0, 3).join(", ");
  const more = unseen.from.length > 3 ? " and more" : "";
  const line = unseen.count === 1
    ? `${who} sent you a high five`
    : `${unseen.count} high fives from ${who}${more}`;

  return (
    <div
      role="status"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/92 backdrop-blur-sm ${
        leaving ? "hi5-leave" : "hi5-enter"
      }`}
    >
      {/* The whole surface dismisses it, so nobody has to find a close button
          for something that is leaving on its own anyway. */}
      <button className="absolute inset-0" aria-label="Dismiss" onClick={() => done.current()} />
      <div className="pointer-events-none relative flex flex-col items-center">
        <span className="hi5-ring absolute h-32 w-32 rounded-full border-2 border-beat" aria-hidden />
        <span className="hi5-ring-late absolute h-32 w-32 rounded-full border-2 border-beat" aria-hidden />
        {/* Eight of them thrown outward from behind the big one. Rotated by
            index rather than at random: a fixed fan reads as a burst, where
            random angles read as a bug the second time you see it. */}
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="hi5-spark absolute text-[26px]"
            style={{ ["--a" as string]: `${i * 45}deg`, animationDelay: `${0.1 + i * 0.03}s` }}
            aria-hidden
          >
            🙌
          </span>
        ))}
        <span className="hi5-hand text-[96px] leading-none" aria-hidden>🙌</span>
        <p className="hi5-line mt-6 max-w-xs px-6 text-center text-[19px] font-semibold text-text">
          {line}
        </p>
      </div>
    </div>
  );
}

function FriendWeek({
  friend, tally, busy, onRemove,
}: {
  friend: FriendCard;
  tally: { got: number; sent: number };
  busy: boolean;
  onRemove: () => void;
}) {
  // Sending lives in the card, so what it has to say is said where the button
  // is. It used to set a note in the parent, which rendered it in the
  // add-a-friend panel — she had to scroll to the top of the screen to find
  // out whether the button under her thumb had worked.
  const [sending, setSending] = useState(false);
  const [sentNow, setSentNow] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  async function highFive() {
    setSending(true);
    setSendError(null);
    try {
      const res = await action<{ ok: boolean; error?: string }>(
        "send_high_five", { friendshipId: friend.friendshipId },
      );
      if (!res.ok) { setSendError(res.error ?? "Couldn't send that."); return; }
      setSentNow((n) => n + 1);
    } catch (err) {
      setSendError(actionMessage(err, "Couldn't send that."));
    } finally {
      setSending(false);
    }
  }

  const sent = tally.sent + sentNow;

  return (
    <section className="relative card p-5">
      {/* The stamp. It counts what this friend has sent her, ever, and it does
          not clear when she looks at it — a high five she has already seen is
          still one she was sent. */}
      {tally.got > 0 && (
        <span
          className="absolute right-3 top-3 -rotate-[9deg] rounded-lg border border-beat/50 bg-beat-soft px-2 py-1 text-[13px] font-semibold tabular-nums text-beat"
          title={`${tally.got} high five${tally.got === 1 ? "" : "s"} from ${friend.name}`}
        >
          🙌 {tally.got}
        </span>
      )}

      {/* The name gets its own line on a phone. Side by side, the rank was
          `shrink-0` and the name was the thing that could give — so "Maria"
          next to "KNOWS WHERE THE DUMBBELLS ARE" came out as "M". Ranks are
          long by design and names are short; the one that has to fit is the
          one that says who this is. */}
      <div className="flex flex-col gap-0.5 pr-16 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="min-w-0 truncate text-[15px] font-semibold">{friend.name}</h2>
        <span className="min-w-0 truncate text-[11px] uppercase tracking-widest text-accent">{friend.title}</span>
      </div>

      {friend.sessionsThisWeek === 0 ? (
        // Not "0 sessions". A quiet week is not a score, and someone who has
        // not started yet is a different sentence from someone who stopped.
        <p className="mt-2 text-[13px] text-muted">
          {friend.hasEverLogged ? "Nothing logged this week yet." : "Hasn't logged a session yet."}
        </p>
      ) : (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <Stat label="Sessions" value={String(friend.sessionsThisWeek)} sub="this week" />
          <Stat label="Hard sets" value={String(friend.setsThisWeek)} sub="this week" />
          {/* Load times reps: the number that says how much work a week was,
              rather than how many times somebody turned up. */}
          {friend.volumeThisWeek > 0 && (
            <Stat label="Volume" value={friend.volumeThisWeek.toLocaleString()} sub={`${friend.bestLifts[0]?.unit ?? "lb"} this week`} />
          )}
          {friend.movementsThisWeek > 0 && (
            <Stat label="Movements" value={String(friend.movementsThisWeek)} sub="this week" />
          )}
          {friend.streakWeeks > 0 && (
            <Stat label="Streak" value={String(friend.streakWeeks)} sub={friend.streakWeeks === 1 ? "week" : "weeks"} />
          )}
        </dl>
      )}

      {/* The long view, which a quiet week does not erase. */}
      {friend.hasEverLogged && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/60 pt-3">
          <Stat label="Sessions" value={friend.sessionsAllTime.toLocaleString()} sub="all time" />
          <Stat label="Sets" value={friend.setsAllTime.toLocaleString()} sub="all time" />
          {friend.lastSessionOn && (
            <Stat label="Last session" value={prettyDate(friend.lastSessionOn)} sub="" />
          )}
        </dl>
      )}

      {friend.bestLifts.length > 0 && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">Heaviest this week</p>
          <ul className="space-y-1">
            {friend.bestLifts.map((b, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-muted">{b.exercise}</span>
                <span className="shrink-0 tabular-nums">
                  {b.weight !== null ? `${b.weight} ${b.unit}` : "bodyweight"} × {b.reps}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Best ever, one line per movement. A week can be quiet; what somebody
          has actually lifted is the part worth showing either way. */}
      {friend.bestEver.length > 0 && (
        <div className="mt-3 border-t border-line/60 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">Best ever</p>
          <ul className="space-y-1">
            {friend.bestEver.map((b, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-muted">{b.exercise}</span>
                <span className="shrink-0 tabular-nums text-beat">
                  {b.weight !== null ? `${b.weight} ${b.unit}` : "bodyweight"} × {b.reps}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={highFive}
          disabled={sending}
          className="rounded-full border border-beat/40 bg-beat-soft px-3.5 py-1.5 text-[13px] font-medium text-beat active:opacity-80 disabled:opacity-50"
        >
          {sending ? "…" : "High five 🙌"}
        </button>
        {sentNow > 0 && (
          <span className="text-[13px] text-beat">
            Sent {friend.name} {sentNow === 1 ? "a high five" : `${sentNow} high fives`} 🙌
          </span>
        )}
        {sentNow === 0 && sent > 0 && (
          <span className="text-[12px] text-faint">
            You have sent {sent === 1 ? "one" : sent}
          </span>
        )}
        <button
          onClick={onRemove}
          disabled={busy}
          className="ml-auto text-[12px] text-faint transition-colors hover:text-muted disabled:opacity-50"
        >
          {busy ? "Removing…" : "Stop sharing"}
        </button>
      </div>
      {sendError && <p role="alert" className="mt-2 text-[13px] text-miss">{sendError}</p>}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-[20px] font-semibold tabular-nums">
        {value} <span className="text-[12px] font-normal text-muted">{sub}</span>
      </dd>
    </div>
  );
}
