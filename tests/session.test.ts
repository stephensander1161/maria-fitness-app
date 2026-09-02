import { describe as suite, expect, it } from "vitest";
import { accountAccepts } from "@/lib/session";

/**
 * The half of the session check the edge cannot do.
 *
 * Middleware verifies the signature and expiry against a secret; it has no
 * database, so a disabled account and a "sign out everywhere" are enforced
 * here. Both layers are load-bearing and this one had never been exercised.
 */
const at = (iso: string) => new Date(iso);
const session = (issued: string) => ({ issuedAt: at(issued).getTime() });
const account = (over: Partial<{ disabledAt: Date | null; sessionsValidFrom: Date }> = {}) => ({
  disabledAt: null,
  sessionsValidFrom: at("2026-01-01T00:00:00Z"),
  ...over,
});

suite("who a valid token is still good for", () => {
  it("accepts a live account with a token issued after the cutoff", () => {
    expect(accountAccepts(account(), session("2026-02-01T00:00:00Z"))).toBe(true);
  });

  it("refuses an account that no longer exists", () => {
    expect(accountAccepts(null, session("2026-02-01T00:00:00Z"))).toBe(false);
  });

  it("refuses a disabled account holding a perfectly valid token", () => {
    // The whole point of the second layer: the signature is fine, the expiry
    // is fine, and she still must not get in.
    expect(accountAccepts(
      account({ disabledAt: at("2026-01-15T00:00:00Z") }),
      session("2026-02-01T00:00:00Z"),
    )).toBe(false);
  });

  it("refuses a token issued before a sign-out-everywhere", () => {
    expect(accountAccepts(
      account({ sessionsValidFrom: at("2026-03-01T00:00:00Z") }),
      session("2026-02-01T00:00:00Z"),
    )).toBe(false);
  });

  it("accepts one issued after it", () => {
    expect(accountAccepts(
      account({ sessionsValidFrom: at("2026-03-01T00:00:00Z") }),
      session("2026-03-01T00:00:01Z"),
    )).toBe(true);
  });

  it("treats the cutoff instant itself as still valid", () => {
    // Equal, not before. A token minted in the same millisecond as the cutoff
    // is the one the password change just issued.
    const cutoff = at("2026-03-01T00:00:00Z");
    expect(accountAccepts({ disabledAt: null, sessionsValidFrom: cutoff },
      { issuedAt: cutoff.getTime() })).toBe(true);
  });
});
