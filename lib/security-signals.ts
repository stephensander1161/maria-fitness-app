/**
 * Reading the audit log for things worth a second look.
 *
 * The log has always been written and never read — COMPLIANCE.md says so
 * outright: "the audit log is written but nothing watches it. A brute-force
 * attempt would be recorded and no one would be told." This is the watching
 * half, and it is deliberately pure so it can be tested without a database.
 *
 * The hard part is not spotting attacks, it is **not crying wolf.** A console
 * that flags something on every visit gets ignored, and then it is worse than
 * nothing because it looks like it is working. So every signal here says what
 * the innocent explanation is, and the ones that have a common innocent
 * explanation are ranked below the ones that do not.
 */

export type AuditEvent = {
  at: Date;
  event: string;
  severity: string;
  ip: string | null;
  detail: Record<string, unknown> | null;
};

/** alert: act now. watch: look at it. note: context, probably fine. */
export type SignalLevel = "alert" | "watch" | "note";

export type Signal = {
  kind: string;
  level: SignalLevel;
  title: string;
  /** What it means, including the boring explanation when there is one. */
  detail: string;
  count: number;
  lastAt: Date;
  ip: string | null;
};

/**
 * Thresholds. Set against the per-IP login ceiling in lib/limits.ts (10/hour),
 * so "repeated failures" fires before the limiter does its job silently.
 */
const FAILURES_PER_IP = 5;
const FAILURE_WINDOW_MS = 60 * 60_000;
/** A success is far more interesting when guesses came first from the same place. */
const BREACH_FAILURES = 3;
const BREACH_WINDOW_MS = 2 * 60 * 60_000;
/** How recent an address has to be to count as somewhere new. */
const NEW_IP_MS = 7 * 86_400_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * A request that came from the machine serving it.
 *
 * This matters because the development server writes to the same database
 * production reads, so an afternoon of local testing lands in the same
 * security log as real traffic. Loopback cannot be reached from the internet —
 * Vercel stamps a real client address on everything — so an address like this
 * is somebody working on the app, and ranking it as an attack is precisely the
 * crying wolf the rest of this file is written to avoid.
 *
 * It is set aside rather than dropped: hidden things cannot be checked, and
 * "no signals" and "signals I quietly binned" must not look the same.
 */
export function isLocalAddress(ip: string | null): boolean {
  if (!ip) return false;
  const bare = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  return bare === "::1" || bare === "localhost" || /^127\./.test(bare);
}

const reasonOf = (e: AuditEvent): string =>
  typeof e.detail?.reason === "string" ? e.detail.reason : "";

const userIdOf = (e: AuditEvent): string | null =>
  typeof e.detail?.userId === "string" ? e.detail.userId : null;

/**
 * Everything the console flags, worst first.
 *
 * `knownUserIds` is every account that currently exists. Anything referring to
 * an id outside it is reported — see the note on that signal for why it is a
 * "watch" and not an "alert".
 */
export function securitySignals(
  events: AuditEvent[],
  knownUserIds: Set<string>,
  now: Date = new Date(),
): Signal[] {
  const out: Signal[] = [];
  const all = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());

  // Everything below judges remote traffic only. Local requests are summarised
  // once at the bottom, as context rather than as an incident.
  const local = all.filter((e) => isLocalAddress(e.ip));
  const sorted = all.filter((e) => !isLocalAddress(e.ip));
  const failures = sorted.filter((e) => e.event === "login.failure" || e.event === "signup.failure");
  const successes = sorted.filter((e) => e.event === "login.success" || e.event === "signup.success");

  /* ── a sign-in that follows a run of guesses from the same address ───── */
  //
  // One line per address, not one per success. A single burst of guesses
  // followed by three sign-ins is one story, and printing it three times is
  // how a console trains its reader to scroll past the red one.
  const breaches = new Map<string, Signal>();
  for (const ok of successes) {
    if (!ok.ip) continue;
    const before = failures.filter((f) =>
      f.ip === ok.ip &&
      f.at.getTime() < ok.at.getTime() &&
      ok.at.getTime() - f.at.getTime() <= BREACH_WINDOW_MS);
    if (before.length < BREACH_FAILURES) continue;
    const existing = breaches.get(ok.ip);
    // Keep the most recent, which is the one worth acting on.
    if (existing && existing.lastAt.getTime() >= ok.at.getTime()) continue;
    breaches.set(ok.ip, {
      kind: "success_after_failures",
      level: "alert",
      title: "A sign-in succeeded right after failed attempts",
      detail: `${before.length} failures from ${ok.ip} in the two hours before this succeeded. Innocently, that is someone who forgot their password and got there in the end. If it was not you, change that password now — it also signs every session out.`,
      count: before.length,
      lastAt: ok.at,
      ip: ok.ip,
    });
  }
  out.push(...breaches.values());

  /* ── a run of failures from one address ─────────────────────────────── */
  for (const [ip, group] of byIp(failures)) {
    const recent = group.filter((e) => now.getTime() - e.at.getTime() <= FAILURE_WINDOW_MS * 24);
    if (recent.length < FAILURES_PER_IP) continue;
    const worst = burst(recent, FAILURE_WINDOW_MS);
    if (worst.length < FAILURES_PER_IP) continue;
    out.push({
      kind: "repeated_failures",
      level: "watch",
      title: "Repeated failed sign-ins from one address",
      detail: `${worst.length} failures from ${ip} inside an hour. The per-address ceiling is ten an hour and the global one two hundred, so this was throttled, not open — but a burst like this is someone trying, not someone mistyping.`,
      count: worst.length,
      lastAt: worst[worst.length - 1].at,
      ip,
    });
  }

  /* ── the limiter actually firing ────────────────────────────────────── */
  const limited = sorted.filter((e) => e.event === "login.rate_limited");
  if (limited.length > 0) {
    out.push({
      kind: "rate_limited",
      level: "watch",
      title: "Sign-in rate limit was hit",
      detail: `${limited.length} request${limited.length === 1 ? "" : "s"} turned away for going too fast. Reaching this at all means something was hammering the door, since a person cannot type ten passwords in an hour by accident.`,
      count: limited.length,
      lastAt: limited[limited.length - 1].at,
      ip: limited[limited.length - 1].ip,
    });
  }

  /* ── strangers at an invite-only door ───────────────────────────────── */
  const uninvited = sorted.filter((e) => reasonOf(e) === "not_invited");
  if (uninvited.length > 0) {
    const who = [...new Set(uninvited
      .map((e) => (typeof e.detail?.email === "string" ? e.detail.email : null))
      .filter((x): x is string => Boolean(x)))];
    out.push({
      kind: "uninvited",
      level: "watch",
      title: "Someone tried to get in with an address that was never invited",
      detail: `${uninvited.length} attempt${uninvited.length === 1 ? "" : "s"}${who.length ? ` from ${who.join(", ")}` : ""}. Access is invite-only, so this was refused. It is worth knowing because it means somebody knows this app is here.`,
      count: uninvited.length,
      lastAt: uninvited[uninvited.length - 1].at,
      ip: uninvited[uninvited.length - 1].ip,
    });
  }

  /* ── someone trying to claim an account that is already in use ──────── */
  const claims = sorted.filter((e) => e.event === "signup.failure" && reasonOf(e) === "already_claimed");
  if (claims.length > 0) {
    out.push({
      kind: "claim_attempt",
      level: "watch",
      title: "Someone tried to set a password on an account already in use",
      detail: `${claims.length} attempt${claims.length === 1 ? "" : "s"} on an address that has already been claimed. Refused — sign-up only ever works once per invitation. Innocently it is the account's owner forgetting they had already set one up.`,
      count: claims.length,
      lastAt: claims[claims.length - 1].at,
      ip: claims[claims.length - 1].ip,
    });
  }

  /* ── credentials for an account that was turned off ─────────────────── */
  const disabled = sorted.filter((e) => reasonOf(e) === "disabled");
  if (disabled.length > 0) {
    out.push({
      kind: "disabled_attempt",
      level: "watch",
      title: "Sign-in attempted on a disabled account",
      detail: `${disabled.length} attempt${disabled.length === 1 ? "" : "s"}. The account is off, so nothing was reachable, but somebody still holds working-looking credentials for it.`,
      count: disabled.length,
      lastAt: disabled[disabled.length - 1].at,
      ip: disabled[disabled.length - 1].ip,
    });
  }

  /* ── ids the database has never heard of ────────────────────────────── */
  const strangers = sorted.filter((e) => {
    const id = userIdOf(e);
    return id !== null && !knownUserIds.has(id);
  });
  if (strangers.length > 0) {
    const ids = [...new Set(strangers.map(userIdOf).filter((x): x is string => Boolean(x)))];
    out.push({
      kind: "unknown_account",
      level: "watch",
      title: "Activity recorded against an account that no longer exists",
      detail: `${strangers.length} event${strangers.length === 1 ? "" : "s"} across ${ids.length} account id${ids.length === 1 ? "" : "s"} that are not in the database. Almost always a deleted account, whose history the log keeps on purpose — the point of a log is that it outlives the row. Worth a look only if none of these were ever deleted, because a session is signed with AUTH_SECRET and an id nobody ever issued should be impossible.`,
      count: strangers.length,
      lastAt: strangers[strangers.length - 1].at,
      ip: strangers[strangers.length - 1].ip,
    });
  }

  /* ── a Google round trip that did not add up ────────────────────────── */
  const oauth = sorted.filter((e) =>
    ["oauth_state_mismatch", "oauth_exchange_failed"].includes(reasonOf(e)));
  if (oauth.length > 0) {
    const mismatch = oauth.filter((e) => reasonOf(e) === "oauth_state_mismatch").length;
    out.push({
      kind: "oauth_anomaly",
      level: mismatch > 0 ? "watch" : "note",
      title: "Google sign-in did not complete cleanly",
      detail: mismatch > 0
        ? `${mismatch} callback${mismatch === 1 ? "" : "s"} arrived without matching the browser that started it. Usually a stale tab or a link opened twice; it is also the shape of a forged callback, which is why the check exists.`
        : `${oauth.length} exchange${oauth.length === 1 ? "" : "s"} with Google failed. Normally an expired code or a network blip on the way back.`,
      count: oauth.length,
      lastAt: oauth[oauth.length - 1].at,
      ip: oauth[oauth.length - 1].ip,
    });
  }

  /* ── a successful sign-in from somewhere not seen before ────────────── */
  const firstSeen = new Map<string, Date>();
  for (const s of successes) {
    if (!s.ip) continue;
    if (!firstSeen.has(s.ip)) firstSeen.set(s.ip, s.at);
  }
  if (firstSeen.size > 1) {
    for (const [ip, at] of firstSeen) {
      if (now.getTime() - at.getTime() > NEW_IP_MS) continue;
      const older = [...firstSeen.values()].some((d) => d.getTime() < at.getTime());
      if (!older) continue;
      out.push({
        kind: "new_location",
        level: "note",
        title: "First sign-in from a new address",
        detail: `${ip} had not been seen before. A new phone, a different network or a trip all look like this, so it is context rather than a problem.`,
        count: successes.filter((s) => s.ip === ip).length,
        lastAt: at,
        ip,
      });
    }
  }

  /* ── work done on this machine ──────────────────────────────────────── */
  if (local.length > 0) {
    const failed = local.filter((e) => e.event.endsWith(".failure") || e.event === "login.rate_limited").length;
    out.push({
      kind: "local_activity",
      level: "note",
      title: "Activity from this machine",
      detail: `${local.length} event${local.length === 1 ? "" : "s"} from a loopback address${failed ? `, ${failed} of them failed sign-ins or throttling` : ""}. That is the development server, which writes to this same database — it cannot be reached from the internet, so none of it is counted above.`,
      count: local.length,
      lastAt: local[local.length - 1].at,
      ip: local[local.length - 1].ip,
    });
  }

  const rank: Record<SignalLevel, number> = { alert: 0, watch: 1, note: 2 };
  return out.sort((a, b) =>
    rank[a.level] - rank[b.level] || b.lastAt.getTime() - a.lastAt.getTime());
}

/** Group by address, skipping events that never carried one. */
function byIp(events: AuditEvent[]): Map<string, AuditEvent[]> {
  const map = new Map<string, AuditEvent[]>();
  for (const e of events) {
    if (!e.ip || e.ip === "unknown") continue;
    map.set(e.ip, [...(map.get(e.ip) ?? []), e]);
  }
  return map;
}

/** The densest run of events inside one window — a sliding count, not a total. */
function burst(events: AuditEvent[], windowMs: number): AuditEvent[] {
  let best: AuditEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const run = events.filter((e) =>
      e.at.getTime() >= events[i].at.getTime() &&
      e.at.getTime() - events[i].at.getTime() <= windowMs);
    if (run.length > best.length) best = run;
  }
  return best;
}

export { isRecord };
