"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, actionMessage } from "@/lib/client";
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
 */
export function FriendsClient({
  myCode, friends, waitingOnYou, waitingOnThem,
}: {
  myCode: string;
  friends: FriendCard[];
  waitingOnYou: Edge[];
  waitingOnThem: Edge[];
}) {
  const router = useRouter();
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
      {/* Her code, first: nothing else on this screen works until someone has it. */}
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
            className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-ink disabled:opacity-40"
          >
            {busy === "add" ? "Asking…" : "Ask"}
          </button>
        </form>
        {note && <p className="mt-2 text-[13px] text-beat">{note}</p>}
        {error && <p role="alert" className="mt-2 text-[13px] text-miss">{error}</p>}
      </section>

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
                    className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-50"
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
            Nobody yet. Send someone your code, or add theirs above, and you will both see
            sessions, streaks and best lifts here.
          </p>
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {friends.map((f) => (
            <FriendWeek
              key={f.friendshipId}
              friend={f}
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

      <p className="px-1 pt-1 text-[12px] leading-relaxed text-faint">
        Friends see training only: sessions, streak, sets and best lifts. Never your weight,
        measurements, photos, food or anything you tell your coach.
      </p>
    </div>
  );
}

function FriendWeek({
  friend, busy, onRemove,
}: {
  friend: FriendCard; busy: boolean; onRemove: () => void;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-[15px] font-semibold">{friend.name}</h2>
        <span className="shrink-0 text-[11px] uppercase tracking-widest text-accent">{friend.title}</span>
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
          {friend.streakWeeks > 0 && (
            <Stat label="Streak" value={String(friend.streakWeeks)} sub={friend.streakWeeks === 1 ? "week" : "weeks"} />
          )}
        </dl>
      )}

      {friend.bestLifts.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line/60 pt-3">
          {friend.bestLifts.map((b, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-muted">{b.exercise}</span>
              <span className="shrink-0 tabular-nums">
                {b.weight !== null ? `${b.weight} ${b.unit}` : "bodyweight"} × {b.reps}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onRemove}
        disabled={busy}
        className="mt-3 text-[12px] text-faint transition-colors hover:text-muted disabled:opacity-50"
      >
        {busy ? "Removing…" : "Stop sharing"}
      </button>
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
