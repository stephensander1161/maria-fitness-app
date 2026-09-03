/**
 * Generate the one key pair web push needs. Run: npm run vapid
 *
 * The public key is handed to the browser when it subscribes; the private key
 * signs the JWT that proves a push came from this deployment. Neither is a
 * secret about her — losing the private key would let someone else send her a
 * notification, not read anything of hers.
 *
 * Exported through JWK rather than by slicing DER. The first version of this
 * did the slicing by hand and printed the tail of the *public* key as the
 * private one: both are 32 bytes and sit near the end of their encodings, so
 * the mistake produced something that looked exactly like a key. The check at
 * the bottom is here because of that.
 */
import { createPrivateKey, createSign, createVerify, generateKeyPairSync } from "node:crypto";

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" }) as { d: string; x: string; y: string };

// What the Push API wants: the uncompressed point, 0x04 || X || Y.
const point = Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)]);
const scalar = fromB64url(jwk.d);

// Prove the pair works the way lib/push.ts will use it — rebuilt from the raw
// scalar alone, signing something the real public key can verify.
const prefix = Buffer.from("308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420", "hex");
const rebuilt = createPrivateKey({
  key: Buffer.concat([prefix, scalar]), format: "der", type: "pkcs8",
});
const signature = createSign("SHA256").update("vapid-self-check").sign(rebuilt);
if (!createVerify("SHA256").update("vapid-self-check").verify(publicKey, signature)) {
  console.error("✗ the generated pair does not verify — refusing to print it");
  process.exit(1);
}
if (point.length !== 65 || scalar.length !== 32) {
  console.error("✗ unexpected key sizes — refusing to print them");
  process.exit(1);
}

console.log("✓ pair generated and verified\n");
console.log("Add these to .env and to Vercel's environment variables:\n");
console.log(`VAPID_PUBLIC_KEY=${b64url(point)}`);
console.log(`VAPID_PRIVATE_KEY=${b64url(scalar)}`);
console.log("VAPID_SUBJECT=mailto:you@example.com   # any address you own\n");
console.log("Then redeploy. Subscriptions are tied to the public key, so changing");
console.log("it later means allowing notifications again on every device.");
