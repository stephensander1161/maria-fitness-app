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
      // Truncated: enough to distinguish devices, not to fingerprint precisely.
      userAgent: opts.req?.headers.get("user-agent")?.slice(0, 160) ?? null,
      detail: opts.detail ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record", event, err);
  }
}

/**
 * "m***@gmail.com" — first letter and domain, nothing else. Enough to tell
 * "she used her other address" from a stranger, without the log becoming a
 * record of strangers' addresses.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local?.slice(0, 1) ?? ""}***@${domain ?? ""}`;
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
