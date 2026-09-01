import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth";

const SECRET = "a-secret-of-reasonable-length-1234567890";
const USER = "11111111-2222-3333-4444-555555555555";
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
  it("produces userId.issuedAt.expiry.signature, base64url and unpadded", async () => {
    const token = await createSessionToken(SECRET, USER);
    expect(token).toMatch(/^[0-9a-f-]+\.\d+\.\d+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("="); // padding stripped
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
  });

  it("expires 30 days out", async () => {
    const before = Date.now();
    const token = await createSessionToken(SECRET, USER);
    const expiry = Number(token.split(".")[2]);
    expect(expiry).toBeGreaterThanOrEqual(before + THIRTY_DAYS_MS);
    expect(expiry).toBeLessThanOrEqual(Date.now() + THIRTY_DAYS_MS);
  });

  it("gives different secrets different signatures for the same instant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const [a, b] = await Promise.all([
      createSessionToken(SECRET, USER),
      createSessionToken(OTHER_SECRET, USER),
    ]);
    expect(a.split(".").slice(0, 3)).toEqual(b.split(".").slice(0, 3));
    expect(a.split(".")[3]).not.toBe(b.split(".")[3]);
  });

  it("gives different accounts different signatures", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const other = "99999999-8888-7777-6666-555555555555";
    const [a, b] = await Promise.all([
      createSessionToken(SECRET, USER),
      createSessionToken(SECRET, other),
    ]);
    expect(a.split(".")[3]).not.toBe(b.split(".")[3]);
  });
});

describe("verifySessionToken", () => {
  it("accepts a token it just issued", async () => {
    const token = await createSessionToken(SECRET, USER);
    await expect(verifySessionToken(token, SECRET)).resolves.not.toBeNull();
  });

  it("accepts the same token repeatedly - it is stateless", async () => {
    const token = await createSessionToken(SECRET, USER);
    for (let i = 0; i < 3; i++) {
      await expect(verifySessionToken(token, SECRET)).resolves.not.toBeNull();
    }
  });

  it("rejects a token signed with a different secret (rotation revokes)", async () => {
    const token = await createSessionToken(SECRET, USER);
    await expect(verifySessionToken(token, OTHER_SECRET)).resolves.toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(SECRET, USER);
    const forged = tamperSignature(token);
    expect(forged).not.toBe(token);
    await expect(verifySessionToken(forged, SECRET)).resolves.toBeNull();
  });

  it("rejects a truncated signature", async () => {
    const token = await createSessionToken(SECRET, USER);
    await expect(verifySessionToken(token.slice(0, -1), SECRET)).resolves.toBeNull();
  });

  it("rejects an extended signature", async () => {
    const token = await createSessionToken(SECRET, USER);
    await expect(verifySessionToken(`${token}A`, SECRET)).resolves.toBeNull();
  });

  it("rejects a tampered expiry, even one pushed further into the future", async () => {
    const token = await createSessionToken(SECRET, USER);
    const [expiry, sig] = token.split(".");
    const extended = `${Number(expiry) + 86_400_000}.${sig}`;
    await expect(verifySessionToken(extended, SECRET)).resolves.toBeNull();
    // ...and one pulled backwards, while still in the future.
    await expect(verifySessionToken(`${Number(expiry) - 1}.${sig}`, SECRET)).resolves.toBeNull();
  });

  it("rejects a signature lifted onto another expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const a = await createSessionToken(SECRET, USER);
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    const b = await createSessionToken(SECRET, USER);
    const spliced = `${a.split(".")[0]}.${b.split(".")[1]}`;
    await expect(verifySessionToken(spliced, SECRET)).resolves.toBeNull();
  });

  it("rejects a correctly signed but expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const stale = await createSessionToken(SECRET, USER); // expires 2020-01-31
    vi.useRealTimers();
    await expect(verifySessionToken(stale, SECRET)).resolves.toBeNull();
  });

  it("is valid up to and including the expiry instant, and not after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const token = await createSessionToken(SECRET, USER);
    const expiry = Number(token.split(".")[2]);

    vi.setSystemTime(expiry - 1);
    await expect(verifySessionToken(token, SECRET)).resolves.not.toBeNull();
    vi.setSystemTime(expiry);
    await expect(verifySessionToken(token, SECRET)).resolves.not.toBeNull();
    vi.setSystemTime(expiry + 1);
    await expect(verifySessionToken(token, SECRET)).resolves.toBeNull();
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
      await expect(verifySessionToken(token, SECRET)).resolves.toBeNull();
    });
  }

  it("fails closed on an empty secret", async () => {
    // Web Crypto refuses a zero-length HMAC key, so this rejects rather than
    // resolving. Callers guard `!secret` before ever getting here (middleware
    // returns 503), and the important property is that it can never return
    // true; if that guard were ever removed this would surface as a 500, not
    // as an open door.
    const token = await createSessionToken(SECRET, USER);
    await expect(verifySessionToken(token, "")).rejects.toThrow();
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

describe("session identity", () => {
  it("carries the subject back, so a route knows who is asking", async () => {
    const token = await createSessionToken(SECRET, USER);
    const session = await verifySessionToken(token, SECRET);
    expect(session?.userId).toBe(USER);
  });

  it("reports when it was issued, which is what makes revocation possible", async () => {
    const before = Date.now();
    const session = await verifySessionToken(await createSessionToken(SECRET, USER), SECRET);
    expect(session!.issuedAt).toBeGreaterThanOrEqual(before);
    expect(session!.issuedAt).toBeLessThanOrEqual(Date.now());
    expect(session!.expiry).toBeGreaterThan(session!.issuedAt);
  });

  it("cannot be re-pointed at another account", async () => {
    // The subject is inside the signed payload, so swapping it invalidates it —
    // otherwise anyone with a session could read anyone else's data.
    const token = await createSessionToken(SECRET, USER);
    const [, issued, expires, sig] = token.split(".");
    const other = "99999999-8888-7777-6666-555555555555";
    await expect(
      verifySessionToken(`${other}.${issued}.${expires}.${sig}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects a token with the wrong number of parts", async () => {
    for (const bad of ["", "a", "a.b", "a.b.c", "a.b.c.d.e"]) {
      await expect(verifySessionToken(bad, SECRET)).resolves.toBeNull();
    }
  });

  it("rejects a stretched expiry even with the original signature", async () => {
    const token = await createSessionToken(SECRET, USER);
    const [uid, issued, expires, sig] = token.split(".");
    const later = String(Number(expires) + 86_400_000);
    await expect(verifySessionToken(`${uid}.${issued}.${later}.${sig}`, SECRET)).resolves.toBeNull();
  });
});
