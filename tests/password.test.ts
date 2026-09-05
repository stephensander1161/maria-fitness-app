import { describe as suite, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";

/**
 * scrypt here is deliberately expensive — N=2^17, about 200ms and 128MB per
 * call — so a test doing six of them can pass in a second on its own and blow
 * vitest's five-second default when the whole suite runs in parallel. It did:
 * one flake on a security test, which is the worst kind to teach anyone to
 * ignore. The work and the assertions are unchanged; only the clock is.
 */
suite("password hashing", { timeout: 30_000 }, () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password, including near-misses", async () => {
    const hash = await hashPassword("Sunflower-92");
    for (const wrong of ["sunflower-92", "Sunflower-9", "Sunflower-92 ", "", "Sunflower-93"]) {
      expect(await verifyPassword(wrong, hash), wrong).toBe(false);
    }
  });

  it("salts, so the same password never produces the same hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    // Both still verify — the salt is carried in the encoding.
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("records its parameters, so they can be raised later", async () => {
    const hash = await hashPassword("x");
    const [scheme, n, r, p, salt, key] = hash.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(131072); // OWASP minimum for scrypt
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt.length).toBeGreaterThan(0);
    expect(key.length).toBeGreaterThan(0);
  });

  it("never stores the password itself", async () => {
    const secret = "a-very-distinctive-passphrase";
    expect(await hashPassword(secret)).not.toContain(secret);
  });

  it("survives a malformed or hostile stored value instead of throwing", async () => {
    for (const bad of [
      "", "garbage", "scrypt$$$$", "bcrypt$1$2$3$4$5",
      "scrypt$notanumber$8$1$c2FsdA$aGFzaA",
      "scrypt$131072$8$1$$",
    ]) {
      await expect(verifyPassword("x", bad)).resolves.toBe(false);
    }
  });

  it("normalises unicode, so an accent typed two ways still matches", async () => {
    const composed = "café";           // U+00E9
    const decomposed = "café";   // e + combining acute
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("flags weaker legacy parameters for upgrade", async () => {
    expect(needsRehash(await hashPassword("x"))).toBe(false);
    expect(needsRehash("scrypt$16384$8$1$c2FsdA$aGFzaA")).toBe(true);
    expect(needsRehash("bcrypt$2b$10$whatever")).toBe(true);
  });
});
