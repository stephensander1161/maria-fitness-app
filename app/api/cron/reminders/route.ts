import { sweepReminders } from "@/lib/reminders";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hourly. The work is in lib/reminders.ts; this is the door and the guard.
 *
 * Vercel signs its cron calls with CRON_SECRET. Without one configured the
 * endpoint refuses outright rather than standing open as a trigger anyone
 * could pull — the same fail-closed rule as a missing AUTH_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "No CRON_SECRET configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepReminders();
  // Counts only. Which person was reminded to stand on a scale is her
  // business, and the audit log is explicitly not the place for body data.
  if (result.sent > 0 || result.dropped > 0) {
    await audit("reminder.sent", { detail: { sent: result.sent, dropped: result.dropped } });
  }
  return Response.json({ ok: true, ...result });
}
