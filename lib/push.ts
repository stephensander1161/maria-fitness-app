import { createSign, createPrivateKey } from "node:crypto";

/**
 * Web push, without a payload and without a dependency.
 *
 * A push message can carry encrypted data, and encrypting it properly means
 * ECDH plus AES-128-GCM plus a library to get that right. Nothing here needs
 * it: the only notification this app sends says "time to weigh in", which is
 * a fixed string the service worker already knows. So the push is a bare
 * wake-up — the browser vendor is told to nudge the device, and is told
 * nothing else.
 *
 * That is also the private thing to do. A payload passes through Apple's or
 * Google's push service; a reminder with no payload passes nothing at all
 * about her through it, which is why COMPLIANCE.md can list this as a
 * destination with no data attached.
 *
 * The VAPID half is a signed JWT proving the sender is this deployment.
 * `node:crypto` signs ES256 directly, so there is no third-party library in
 * the path of a notification.
 */

/** Keys live in the environment; without them nothing is sent, quietly. */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A raw P-256 private key (32 bytes, base64url) as a signing key.
 *
 * Written as a DER PKCS#8 blob with the curve parameters prepended, which is
 * the shape node's crypto wants and the shape the web-push tooling does not
 * produce. The public key is not needed for signing.
 */
function signingKey(rawPrivate: string) {
  const d = Buffer.from(rawPrivate.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (d.length !== 32) throw new Error("VAPID_PRIVATE_KEY must be a 32-byte base64url value");
  const prefix = Buffer.from("308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex");
  return createPrivateKey({ key: Buffer.concat([prefix, d]), format: "der", type: "pkcs8" });
}

/** The JWT that proves who is sending. Twelve hours, well inside the 24 cap. */
function vapidToken(audience: string): string {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: process.env.VAPID_SUBJECT,
  }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${body}`);
  // DER-encoded by default; a JWS wants the raw r||s pair.
  const der = signer.sign(signingKey(process.env.VAPID_PRIVATE_KEY ?? ""));
  return `${header}.${body}.${b64url(derToRaw(der))}`;
}

/**
 * ECDSA signatures come back DER-encoded; a JWS wants the raw r||s pair.
 *
 * Parsed rather than assumed. Each half is a DER INTEGER, which is signed —
 * so it carries a leading zero byte whenever its top bit is set, and is short
 * whenever it has leading zeros of its own. Both happen roughly one time in
 * two hundred and fifty six, which is exactly often enough to work in testing
 * and fail in front of someone.
 */
export function derToRaw(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error("not a DER sequence");
  // A P-256 signature is short enough that the sequence length is one byte.
  let offset = 2;
  const readInt = () => {
    if (der[offset] !== 0x02) throw new Error("expected a DER integer");
    const length = der[offset + 1];
    const value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    // Drop a sign byte; keep everything else.
    return value[0] === 0 ? value.subarray(1) : value;
  };

  const r = readInt();
  const s = readInt();
  if (r.length > 32 || s.length > 32) throw new Error("signature halves too long");

  const out = Buffer.alloc(64);
  // Right-aligned, so a short half is zero-padded at the front rather than
  // shifting the other one along.
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

export type PushOutcome = "sent" | "gone" | "failed" | "not-configured";

/**
 * Nudge one subscription.
 *
 * "gone" is the answer that matters: a 404 or 410 means the browser has
 * thrown the subscription away — she uninstalled the app or cleared her data
 * — and the row should go with it rather than being retried every hour for
 * ever.
 */
export async function sendPush(endpoint: string): Promise<PushOutcome> {
  if (!pushConfigured()) return "not-configured";
  try {
    const audience = new URL(endpoint).origin;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapidToken(audience)}, k=${vapidPublicKey()}`,
        TTL: "3600",
        // No body, so no Content-Encoding. Some services reject a declared
        // encoding with nothing to decode.
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
