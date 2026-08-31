import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  createSessionToken,
  passphraseMatches,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth";

const SECRET = "a-secret-of-reasonable-length-1234567890";
const OTHER_SECRET = "a-secret-of-reasonable-length-1234567891";
const THIRTY_DAYS_MS = 30 * 86_400_000;

/** Swap one character of the signature for a different valid base64url one. */
const tamperSignature = (token: string) => {
  const dot = token.indexOf(".");
  const sig = token.slice(dot + 1);
  const last = sig.slice(-1);
  return `${token.slice(0, dot)}.${sig.slice(0, -1)}${last === "A" ? "B" : "A"}`;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionToken", () => {
  it("produces <expiryMs>.<base64url signature>", async () => {
    const token = await createSessionToken(SECRET);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("="); // padding stripped
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
  });

  it("expires 30 days out", async () => {
    const before = Date.now();
    const token = await createSessionToken(SECRET);
    const expiry = Number(token.split(".")[0]);
    expect(expiry).toBeGreaterThanOrEqual(before + THIRTY_DAYS_MS);
    expect(expiry).toBeLessThanOrEqual(Date.now() + THIRTY_DAYS_MS);
  });

  it("gives different secrets different signatures for the same instant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const [a, b] = await Promise.all([createSessionToken(SECRET), createSessionToken(OTHER_SECRET)]);
    expect(a.split(".")[0]).toBe(b.split(".")[0]);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });
});

describe("verifySessionToken", () => {
  it("accepts a token it just issued", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
  });

  it("accepts the same token repeatedly - it is stateless", async () => {
    const token = await createSessionToken(SECRET);
    for (let i = 0; i < 3; i++) {
      await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
    }
  });

  it("rejects a token signed with a different secret (rotation revokes)", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, OTHER_SECRET)).resolves.toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(SECRET);
    const forged = tamperSignature(token);
    expect(forged).not.toBe(token);
    await expect(verifySessionToken(forged, SECRET)).resolves.toBe(false);
  });

  it("rejects a truncated signature", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token.slice(0, -1), SECRET)).resolves.toBe(false);
  });

  it("rejects an extended signature", async () => {
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(`${token}A`, SECRET)).resolves.toBe(false);
  });

  it("rejects a tampered expiry, even one pushed further into the future", async () => {
    const token = await createSessionToken(SECRET);
    const [expiry, sig] = token.split(".");
    const extended = `${Number(expiry) + 86_400_000}.${sig}`;
    await expect(verifySessionToken(extended, SECRET)).resolves.toBe(false);
    // ...and one pulled backwards, while still in the future.
    await expect(verifySessionToken(`${Number(expiry) - 1}.${sig}`, SECRET)).resolves.toBe(false);
  });

  it("rejects a signature lifted onto another expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const a = await createSessionToken(SECRET);
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    const b = await createSessionToken(SECRET);
    const spliced = `${a.split(".")[0]}.${b.split(".")[1]}`;
    await expect(verifySessionToken(spliced, SECRET)).resolves.toBe(false);
  });

  it("rejects a correctly signed but expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const stale = await createSessionToken(SECRET); // expires 2020-01-31
    vi.useRealTimers();
    await expect(verifySessionToken(stale, SECRET)).resolves.toBe(false);
  });

  it("is valid up to and including the expiry instant, and not after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const token = await createSessionToken(SECRET);
    const expiry = Number(token.split(".")[0]);

    vi.setSystemTime(expiry - 1);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
    vi.setSystemTime(expiry);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
    vi.setSystemTime(expiry + 1);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(false);
  });

  const garbage: [name: string, token: string | undefined][] = [
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["no dot", "abcdefgh"],
    ["just a dot", "."],
    ["empty expiry", ".signature"],
    ["leading dot with digits", ".1234567890123"],
    ["empty signature", "9999999999999."],
    ["non-numeric expiry", "notanumber.signature"],
    ["NaN expiry", "NaN.signature"],
    ["Infinity expiry", "Infinity.signature"],
    ["negative expiry", "-1.signature"],
    ["zero expiry", "0.signature"],
    ["json", '{"expiry":1}'],
    ["a bare signature", "Zm9vYmFyYmF6"],
  ];

  for (const [name, token] of garbage) {
    it(`rejects ${name}`, async () => {
      await expect(verifySessionToken(token, SECRET)).resolves.toBe(false);
    });
  }

  it("fails closed on an empty secret", async () => {
    // Web Crypto refuses a zero-length HMAC key, so this rejects rather than
    // resolving. Callers guard `!secret` before ever getting here (middleware
    // returns 503), and the important property is that it can never return
    // true; if that guard were ever removed this would surface as a 500, not
    // as an open door.
    const token = await createSessionToken(SECRET);
    await expect(verifySessionToken(token, "")).rejects.toThrow();
  });
});

describe("passphraseMatches", () => {
  const REAL = "correct horse battery staple";

  const cases: [name: string, attempt: string, expected: boolean][] = [
    ["the exact passphrase", REAL, true],
    ["a different passphrase", "wrong horse battery staple", false],
    ["a prefix of the real passphrase", "correct horse battery stapl", false],
    ["a single character", "c", false],
    ["the empty string", "", false],
    ["a superset of the real passphrase", `${REAL} extra`, false],
    ["a trailing space", `${REAL} `, false],
    ["a leading space", ` ${REAL}`, false],
    ["different capitalisation", "Correct Horse Battery Staple", false],
    ["a same-length near miss", "correct horse battery stapld", false],
  ];

  for (const [name, attempt, expected] of cases) {
    it(`${expected ? "accepts" : "rejects"} ${name}`, async () => {
      await expect(passphraseMatches(attempt, REAL, SECRET)).resolves.toBe(expected);
    });
  }

  it("matches regardless of which secret keys the comparison", async () => {
    await expect(passphraseMatches(REAL, REAL, OTHER_SECRET)).resolves.toBe(true);
    await expect(passphraseMatches("nope", REAL, OTHER_SECRET)).resolves.toBe(false);
  });

  it("handles unicode passphrases", async () => {
    await expect(passphraseMatches("passwoerd-é", "passwoerd-é", SECRET)).resolves.toBe(true);
    await expect(passphraseMatches("passwoerd-e", "passwoerd-é", SECRET)).resolves.toBe(false);
  });

  it("compares two empty passphrases as equal - the caller must reject an unset one", async () => {
    await expect(passphraseMatches("", "", SECRET)).resolves.toBe(true);
  });
});

describe("cookie settings", () => {
  it("keeps the session out of JavaScript's reach and off cross-site requests", () => {
    expect(SESSION_COOKIE).toBe("coach_session");
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(sessionCookieOptions.sameSite).toBe("lax");
    expect(sessionCookieOptions.path).toBe("/");
  });

  it("expires the cookie alongside the token it carries", () => {
    expect(sessionCookieOptions.maxAge * 1000).toBe(THIRTY_DAYS_MS);
  });
});
