import { describe as suite, expect, it } from "vitest";
import { securitySignals, type AuditEvent } from "@/lib/security-signals";

/**
 * The audit log has always been written and never read. This is the reading,
 * and the thing it has to get right is *silence*: a console that flags
 * something every time is one nobody looks at, and then it is worse than
 * nothing because it looks like it is working.
 *
 * So there are as many tests here for what must NOT be flagged as for what
 * must.
 */
const NOW = new Date("2026-09-04T12:00:00Z");
const ago = (mins: number) => new Date(NOW.getTime() - mins * 60_000);

const ev = (over: Partial<AuditEvent> & Pick<AuditEvent, "event">): AuditEvent => ({
  at: ago(10), severity: "info", ip: "203.0.113.7", detail: null, ...over,
});

const failure = (mins: number, over: Partial<AuditEvent> = {}) =>
  ev({ event: "login.failure", severity: "warn", at: ago(mins), detail: { reason: "bad_password" }, ...over });

const success = (mins: number, over: Partial<AuditEvent> = {}) =>
  ev({ event: "login.success", at: ago(mins), detail: { userId: "known-1" }, ...over });

const KNOWN = new Set(["known-1", "known-2"]);
const kinds = (s: ReturnType<typeof securitySignals>) => s.map((x) => x.kind);

suite("it stays quiet when nothing is wrong", () => {
  it("says nothing about an ordinary week", () => {
    const events = [success(4000), success(2000), success(60), ev({ event: "logout", at: ago(30) })];
    expect(securitySignals(events, KNOWN, NOW)).toEqual([]);
  });

  it("says nothing about an empty log", () => {
    expect(securitySignals([], KNOWN, NOW)).toEqual([]);
  });

  it("does not flag a couple of mistyped passwords", () => {
    // Everybody does this. Flagging it is how a console teaches you to ignore it.
    const events = [failure(20), failure(19), success(18)];
    expect(kinds(securitySignals(events, KNOWN, NOW))).toEqual([]);
  });

  it("does not call one person's own account a stranger", () => {
    expect(kinds(securitySignals([success(5)], KNOWN, NOW))).toEqual([]);
  });
});

suite("a guess that landed", () => {
  it("is the loudest thing on the screen", () => {
    const events = [failure(30), failure(28), failure(26), success(25)];
    const [first] = securitySignals(events, KNOWN, NOW);
    expect(first.kind).toBe("success_after_failures");
    expect(first.level).toBe("alert");
    expect(first.count).toBe(3);
  });

  it("says it once per address, however many sign-ins followed", () => {
    // One burst of guesses followed by three sign-ins is one story. Printing
    // it three times is how a console teaches its reader to scroll past red.
    const events = [failure(30), failure(28), failure(26), success(25), success(20), success(15)];
    const alerts = securitySignals(events, KNOWN, NOW).filter((s) => s.kind === "success_after_failures");
    expect(alerts).toHaveLength(1);
    // ...and it is the most recent one, which is the one worth acting on.
    expect(alerts[0].lastAt).toEqual(ago(15));
  });

  it("still reports two different addresses separately", () => {
    const events = [
      failure(30), failure(28), failure(26), success(25),
      failure(30, { ip: "198.51.100.9" }), failure(28, { ip: "198.51.100.9" }),
      failure(26, { ip: "198.51.100.9" }), success(24, { ip: "198.51.100.9" }),
    ];
    const alerts = securitySignals(events, KNOWN, NOW).filter((s) => s.kind === "success_after_failures");
    expect(new Set(alerts.map((a) => a.ip))).toEqual(new Set(["203.0.113.7", "198.51.100.9"]));
  });

  it("ignores failures from a different address", () => {
    // Two people, one of whom is having a bad morning, is not a breach.
    const events = [
      failure(30, { ip: "198.51.100.9" }), failure(28, { ip: "198.51.100.9" }),
      failure(26, { ip: "198.51.100.9" }), success(25, { ip: "203.0.113.7" }),
    ];
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("success_after_failures");
  });

  it("ignores failures that came long before", () => {
    // Last week's forgotten password has nothing to do with today's sign-in.
    const events = [failure(5000), failure(4990), failure(4980), success(10)];
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("success_after_failures");
  });

  it("ignores failures that came after, not before", () => {
    const events = [success(40), failure(30), failure(28), failure(26)];
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("success_after_failures");
  });
});

suite("a run of failures", () => {
  it("is flagged when five land inside an hour", () => {
    const events = [failure(50), failure(45), failure(40), failure(35), failure(30)];
    const sig = securitySignals(events, KNOWN, NOW).find((s) => s.kind === "repeated_failures");
    expect(sig?.level).toBe("watch");
    expect(sig?.count).toBe(5);
  });

  it("is not flagged when the same five are spread across the day", () => {
    // A sliding window, not a total: five failures over sixteen hours is a
    // person who forgets their password, and calling that an attack is how a
    // console teaches you to ignore it.
    //
    // These are deliberately all inside the day the analysis looks at, so the
    // hour-long window is what has to reject them. An earlier version used
    // failures days apart, which a coarser filter excluded first — it passed
    // even with the window replaced by a plain total, and so proved nothing.
    const events = [failure(60), failure(300), failure(600), failure(900), failure(1200)];
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("repeated_failures");
  });

  it("ignores events with no address rather than lumping them together", () => {
    const events = Array.from({ length: 6 }, (_, i) => failure(50 - i, { ip: null }));
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("repeated_failures");
  });
});

suite("an account id the database does not have", () => {
  it("is reported, with the boring explanation attached", () => {
    const events = [ev({ event: "login.success", at: ago(20), detail: { userId: "deleted-9" } })];
    const sig = securitySignals(events, KNOWN, NOW).find((s) => s.kind === "unknown_account");
    expect(sig).toBeDefined();
    // It must not shout "attack": a deleted account is the usual cause, and
    // the log outliving the row is the point of a log.
    expect(sig!.level).toBe("watch");
    expect(sig!.detail).toMatch(/deleted account/i);
  });

  it("groups every stranger into one line rather than one each", () => {
    const events = ["x1", "x2", "x1", "x3"].map((id, i) =>
      ev({ event: "login.success", at: ago(30 - i), detail: { userId: id } }));
    const strangers = securitySignals(events, KNOWN, NOW).filter((s) => s.kind === "unknown_account");
    expect(strangers).toHaveLength(1);
    expect(strangers[0].count).toBe(4);
    expect(strangers[0].detail).toMatch(/3 account ids/);
  });

  it("looks at every event that carries an id, not only sign-ins", () => {
    const events = [ev({ event: "signup.success", at: ago(5), detail: { userId: "ghost" } })];
    expect(kinds(securitySignals(events, KNOWN, NOW))).toContain("unknown_account");
  });
});

suite("the other doors", () => {
  it("flags an address that was never invited", () => {
    const events = [ev({
      event: "login.failure", severity: "warn", at: ago(15),
      detail: { reason: "not_invited", email: "s***@gmail.com" },
    })];
    const sig = securitySignals(events, KNOWN, NOW).find((s) => s.kind === "uninvited");
    expect(sig?.level).toBe("watch");
    // The masked address is the useful part — it tells "her other email" from
    // a stranger without the log holding real addresses.
    expect(sig?.detail).toContain("s***@gmail.com");
  });

  it("flags someone trying to claim an account already in use", () => {
    const events = [ev({
      event: "signup.failure", severity: "warn", at: ago(15),
      detail: { reason: "already_claimed", userId: "known-1" },
    })];
    expect(kinds(securitySignals(events, KNOWN, NOW))).toContain("claim_attempt");
  });

  it("flags an attempt on an account that was turned off", () => {
    const events = [ev({
      event: "login.failure", severity: "warn", at: ago(15),
      detail: { reason: "disabled", userId: "known-2" },
    })];
    expect(kinds(securitySignals(events, KNOWN, NOW))).toContain("disabled_attempt");
  });

  it("flags the rate limiter actually firing", () => {
    const events = [ev({ event: "login.rate_limited", severity: "warn", at: ago(15) })];
    expect(kinds(securitySignals(events, KNOWN, NOW))).toContain("rate_limited");
  });

  it("treats a mismatched Google callback as worse than a failed exchange", () => {
    const mismatch = securitySignals(
      [ev({ event: "login.failure", at: ago(9), detail: { reason: "oauth_state_mismatch" } })], KNOWN, NOW);
    expect(mismatch.find((s) => s.kind === "oauth_anomaly")?.level).toBe("watch");

    const flake = securitySignals(
      [ev({ event: "login.failure", at: ago(9), detail: { reason: "oauth_exchange_failed" } })], KNOWN, NOW);
    expect(flake.find((s) => s.kind === "oauth_anomaly")?.level).toBe("note");
  });
});

suite("somewhere new", () => {
  it("is only context, and only once there is a somewhere old", () => {
    const events = [
      success(20_000, { ip: "203.0.113.7" }),
      success(100, { ip: "198.51.100.4" }),
    ];
    const sig = securitySignals(events, KNOWN, NOW).find((s) => s.kind === "new_location");
    expect(sig?.level).toBe("note");
    expect(sig?.ip).toBe("198.51.100.4");
  });

  it("says nothing when there has only ever been one address", () => {
    const events = [success(20_000), success(100)];
    expect(kinds(securitySignals(events, KNOWN, NOW))).not.toContain("new_location");
  });

  it("does not call the long-standing address new", () => {
    const events = [success(20_000, { ip: "203.0.113.7" }), success(100, { ip: "198.51.100.4" })];
    const flagged = securitySignals(events, KNOWN, NOW)
      .filter((s) => s.kind === "new_location").map((s) => s.ip);
    expect(flagged).not.toContain("203.0.113.7");
  });
});

suite("ordering", () => {
  it("puts what needs acting on above what is merely context", () => {
    const events = [
      success(20_000, { ip: "203.0.113.7" }),
      success(100, { ip: "198.51.100.4" }),
      failure(30), failure(28), failure(26), success(25),
      ev({ event: "login.rate_limited", severity: "warn", at: ago(15) }),
    ];
    const levels = securitySignals(events, KNOWN, NOW).map((s) => s.level);
    expect(levels[0]).toBe("alert");
    expect(levels).toEqual([...levels].sort((a, b) =>
      ({ alert: 0, watch: 1, note: 2 })[a] - ({ alert: 0, watch: 1, note: 2 })[b]));
  });
});
