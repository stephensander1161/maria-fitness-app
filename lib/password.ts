import {
  randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify loses the options overload, so the shape is restated here.
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard, which is the property that matters: it makes GPU and
 * ASIC cracking expensive in a way that iterated SHA never can. Using the
 * built-in also means no dependency to audit, patch, or explain in CI.
 *
 * N=2^17 follows the current OWASP minimum for scrypt. It costs ~200ms and
 * ~128MB per verification, which is the point — it is a cost an attacker pays
 * per guess, and one a real person pays once at login.
 */
const N = 131_072; // 2^17
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
// Node caps scrypt memory at 32MB unless told otherwise; 128*N*r is the need.
const MAXMEM = 256 * 1024 * 1024;

/** `scrypt$N$r$p$salt$hash`, all base64url — self-describing, so the parameters
 *  can be raised later without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N, r: R, p: P, maxmem: MAXMEM,
  });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
    });
    // Equal lengths by construction, so this is genuinely constant time.
    return timingSafeEqual(actual, expected);
  } catch {
    // Malformed parameters shouldn't crash a login attempt.
    return false;
  }
}

/** True when a hash was made with weaker parameters than we now use, so it can
 *  be upgraded transparently on the next successful sign-in. */
export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split("$");
  return scheme !== "scrypt" || Number(n) < N || Number(r) < R || Number(p) < P;
}
