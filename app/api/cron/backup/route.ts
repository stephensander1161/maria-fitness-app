import { audit } from "@/lib/audit";
import { blobConfigured, takeBackup } from "@/lib/backup";
import { cronRefusal } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly (vercel.json). The work is in lib/backup.ts; this is the door, and
 * lib/cron.ts is the guard.
 *
 * Both failure modes are loud. No store is a 503 with a warn-level audit row,
 * not a 200 that took nothing — a backup job that reports success while
 * writing nowhere is the one thing worse than no backup job. A failed run is
 * recorded the same way, so the console can say "the last backup was four
 * nights ago" rather than nothing.
 */
export async function GET(req: Request) {
  const refused = cronRefusal(req);
  if (refused) return refused;

  if (!blobConfigured()) {
    await audit("backup.failed", { detail: { reason: "No BLOB_READ_WRITE_TOKEN configured" } });
    return Response.json({ error: "No BLOB_READ_WRITE_TOKEN configured" }, { status: 503 });
  }

  try {
    const result = await takeBackup();
    // Where it went and how big; counts only, never contents.
    await audit("backup.taken", { detail: { ...result } });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "unknown";
    await audit("backup.failed", { detail: { reason } });
    return Response.json({ error: "Backup failed" }, { status: 500 });
  }
}
