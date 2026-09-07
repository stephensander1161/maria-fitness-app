/**
 * Dump everything of hers to a JSON file, by hand.
 *
 *   npm run backup            -> backups/plate-YYYY-MM-DD-HHmm.json
 *   npm run backup -- path.json
 *
 * The nightly copy is taken by /api/cron/backup into the private blob store
 * (lib/backup.ts holds the dump and explains what is in it). This is the same
 * dump, to a local file, for the moment before a migration. To fetch a
 * stored one instead: `npx vercel blob get backups/plate-2026-09-07.json`.
 */
import fs from "node:fs";
import path from "node:path";
import { audit } from "@/lib/audit";
import { dumpEverything } from "@/lib/backup";

async function main() {
  const dump = await dumpEverything();
  for (const [name, n] of Object.entries(dump.tables)) {
    console.log(`  ${name.padEnd(16)} ${String(n).padStart(5)}`);
  }

  const stamp = new Date().toISOString().replace(/:/g, "").slice(0, 15);
  const target = process.argv[2] ?? path.join("backups", `plate-${stamp}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, dump.json);

  const kb = Math.round(fs.statSync(target).size / 1024);
  await audit("data.exported");
  console.log(`\n✓ ${dump.rows} rows -> ${target} (${kb}KB)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
