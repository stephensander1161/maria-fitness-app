import { desc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Security event log.
 *
 * The point is answerability: if something goes wrong, being able to say when
 * it started, from where, and what changed. Without this the app has no memory
 * of a night spent guessing the passphrase.
 *
 * Deliberately narrow about what it stores. No credentials, no passphrase
 * attempts (not even hashed — a log of near-misses is a wordlist), and none of
 * her body or training data. Enough to investigate, nothing worth stealing.
 */

export type AuditEventName =
  | "login.success"
  | "login.failure"
  | "login.rate_limited"
  // Claiming an invitation with a password of one's own. A failure is a
  // refusal — uninvited, already claimed, or disabled — and is recorded the
  // way a failed sign-in is, because it is the same door being tried.
  | "signup.success"
  | "signup.failure"
  | "logout"
  | "budget.changed"
  // A device registered for notifications. Recorded because it is a new
  // place her app can be reached, and never with the endpoint — that is an
  // address someone else could push to.
  | "push.registered"
  // Counts only, never who: which person was reminded to stand on a scale
  // is her business.
  | "reminder.sent"
  | "data.exported"
  | "data.restored"
  /** Her data handed to a third party at her request — currently the
   *  shopping list to Instacart. Detail carries where and how many, never what. */
  | "data.shared"
  | "data.deleted"
  /**
   * Sharing training with another account. Recorded because it is the only
   * path by which one profile's data reaches a different person, so "who could
   * see what, and from when" has to be answerable. Ids only — never a name,
   * never a code, and never any of the training itself.
   */
  | "friend.requested"
  | "friend.accepted"
  | "friend.declined"
  | "friend.removed"
  | "friend.code_reset"
  /** The owner opened the console that summarises other people's accounts.
   *  Reaching data that is not your own is recorded, even in summary. */
  | "admin.viewed"
  | "onboarding.completed"
  | "spend.ceiling_reached";

const WARN: AuditEventName[] = ["login.failure", "login.rate_limited", "signup.failure", "data.deleted"];

/** Never let logging break the request it is describing. */
export async function audit(
  event: AuditEventName,
  opts: { req?: Request; detail?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      event,
      severity: WARN.includes(event) ? "warn" : "info",
      ip: opts.req ? clientAddress(opts.req) : null,
      location: opts.req ? clientLocation(opts.req) : null,
      // Truncated: enough to distinguish devices, not to fingerprint precisely.
      userAgent: opts.req?.headers.get("user-agent")?.slice(0, 160) ?? null,
      detail: opts.detail ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record", event, err);
  }
}

/**
 * The address that was refused, in full.
 *
 * This used to be masked to "m***@gmail.com", and the reasoning was sound: a
 * security log should not quietly become a record of strangers' addresses.
 * What changed is the evidence. A real alert — seven failures then a success —
 * took a database query to resolve, and the answer was that the owner's father
 * had mistyped his address four times before signing in with Google. The
 * masked version could not tell that story; the full one tells it at a glance,
 * which is the entire job of that screen.
 *
 * The trade is stated rather than hidden: on an invite-only app the addresses
 * reaching here are overwhelmingly the household's own typos, the volume is a
 * handful a month, and only an owner can read them. COMPLIANCE.md records it
 * as a deliberate loosening rather than leaving it as silent drift.
 *
 * Still never recorded: what was typed as a password, hashed or otherwise. A
 * log of near-misses is a wordlist, and that rule has not moved.
 */
export function refusedAddress(email: string): string {
  return email.trim().toLowerCase().slice(0, 200);
}

/** Kept for anywhere that should only ever see a shape, not an address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local?.slice(0, 1) ?? ""}***@${domain ?? ""}`;
}

/**
 * Where the request came from, from headers the platform already set.
 *
 * Vercel attaches these to every request, so there is no lookup, no latency
 * and no third party — which matters, because sending client addresses to a
 * geolocation service would be a new place data leaves this server and would
 * need its own line in COMPLIANCE.md. Locally the headers are absent and this
 * is null, which is correct: a request from this machine has no location worth
 * recording.
 */
function clientLocation(req: Request): string | null {
  const h = req.headers;
  const country = h.get("x-vercel-ip-country");
  const region = h.get("x-vercel-ip-country-region");
  // Vercel percent-encodes the city, so one with a space arrives as %20.
  const rawCity = h.get("x-vercel-ip-city");
  let city: string | null = null;
  try {
    city = rawCity ? decodeURIComponent(rawCity) : null;
  } catch {
    city = rawCity;
  }
  const parts = [city, region, country].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 80) : null;
}

function clientAddress(req: Request): string {
  const real = req.headers.get("x-real-ip");
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0];
  return (real ?? fwd ?? "unknown").trim().slice(0, 45) || "unknown";
}

export async function recentEvents(sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  return db
    .select()
    .from(auditLog)
    .where(gte(auditLog.at, since))
    .orderBy(desc(auditLog.at))
    .limit(500);
}
