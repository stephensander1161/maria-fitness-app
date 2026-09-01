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
  | "logout"
  | "budget.changed"
  | "data.exported"
  | "data.restored"
  | "data.deleted"
  | "spend.ceiling_reached";

const WARN: AuditEventName[] = ["login.failure", "login.rate_limited", "data.deleted"];

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
