import { sweepReminders } from "@/lib/reminders";
import { audit } from "@/lib/audit";
import { cronRefusal } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily (vercel.json). The work is in lib/reminders.ts; this is the door, and
 * lib/cron.ts is the guard.
 */
export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;

  const result = await sweepReminders();
  // Counts only. Which person was reminded to stand on a scale is her
  // business, and the audit log is explicitly not the place for body data.
  if (result.sent > 0 || result.dropped > 0) {
    await audit("reminder.sent", { detail: { sent: result.sent, dropped: result.dropped } });
  }
  return Response.json({ ok: true, ...result });
}
