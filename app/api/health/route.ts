import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the app up, and can it reach its database?
 *
 * For an uptime monitor to ask every minute, and for nothing else. It says
 * `ok` or it says `degraded` with a status that makes the monitor ring; it
 * names no table, no version, no host and no error text, because this is the
 * one route that answers without a session and an attacker reading it should
 * learn only that the door exists. Public in proxy.ts for the same reason a
 * cron route is: the caller has no account.
 */
export async function GET() {
  const at = new Date().toISOString();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, at }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, at }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
