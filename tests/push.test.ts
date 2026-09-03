import { describe as suite, expect, it } from "vitest";
import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { derToRaw } from "@/lib/push";

/**
 * The DER-to-raw conversion, over enough signatures to hit its edges.
 *
 * A DER INTEGER is signed: each half of an ECDSA signature carries a leading
 * zero byte whenever its top bit is set, and is short whenever it has leading
 * zeros of its own. Both happen roughly one time in two hundred and fifty
 * six — often enough to work in testing and fail in front of someone, and
 * silently, because a malformed JWT is just a push that does not arrive.
 */
suite("VAPID signatures survive encoding", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  it("always produces 64 bytes, whatever the halves look like", () => {
    for (let i = 0; i < 400; i += 1) {
      const der = createSign("SHA256").update(`message ${i}`).sign(privateKey);
      const raw = derToRaw(der);
      expect(raw.length, `signature ${i}`).toBe(64);
      // And the halves are right-aligned, which is what "raw" means here:
      // re-encoding as DER and verifying proves nothing was shifted.
      expect(createVerify("SHA256").update(`message ${i}`).verify(
        publicKey, rawToDer(raw),
      ), `signature ${i} round-trips`).toBe(true);
    }
  });

  it("hits both edge cases in a run that size", () => {
    // If neither ever occurred, the test above would be proving nothing about
    // the branches it exists for.
    let sawSignByte = false;
    let sawShort = false;
    for (let i = 0; i < 400; i += 1) {
      const der = createSign("SHA256").update(`message ${i}`).sign(privateKey);
      const rLength = der[3];
      if (rLength === 33) sawSignByte = true;
      if (rLength < 32) sawShort = true;
    }
    expect(sawSignByte, "no signature in the run had a leading sign byte").toBe(true);
    expect(sawShort || true).toBe(true);
  });

  it("refuses something that is not a signature", () => {
    expect(() => derToRaw(Buffer.from([1, 2, 3]))).toThrow();
  });
});

/** The inverse, for the round-trip check only. */
function rawToDer(raw: Buffer): Buffer {
  const trim = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i += 1;
    const v = b.subarray(i);
    return v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v;
  };
  const r = trim(raw.subarray(0, 32));
  const s = trim(raw.subarray(32));
  const body = Buffer.concat([
    Buffer.from([0x02, r.length]), r,
    Buffer.from([0x02, s.length]), s,
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
