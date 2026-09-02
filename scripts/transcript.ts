/**
 * Dump the coach conversation to stdout.
 *
 *   npm run transcript              # last 3 days
 *   npm run transcript -- 14        # last 14 days
 *   npm run transcript -- 3 > /tmp/t.txt
 *
 * The same text the Progress screen copies, for when the fix starts with
 * reading exactly what the coach said. Read-only.
 */
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { runTool } from "@/lib/tools";

async function main() {
  const days = Number(process.argv[2] ?? 3);
  const rows = await db.select({ id: profiles.id, name: profiles.name }).from(profiles);
  if (rows.length === 0) throw new Error("no profiles");

  for (const p of rows) {
    if (rows.length > 1) console.log(`\n════ ${p.name ?? p.id} ════`);
    const out = await runTool("export_transcript", { days }, { profileId: p.id }) as { text: string };
    console.log(out.text);
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
