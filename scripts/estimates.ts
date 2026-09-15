/**
 * Audit the nutrition estimates the app has served.
 *
 *   npm run estimates                 the last 40, newest first
 *   npm run estimates -- --wrong      only the ones she corrected, worst gap first
 *   npm run estimates -- --plates     only answers that counted one food for a meal
 *   npm run estimates -- --limit 100
 *
 * His request: "you better start recording the result every time someone
 * clicks calculate so that we can audit the predictions and improve them."
 * This is the reading half.
 *
 * **A command line rather than a screen, deliberately.** The console at /admin
 * is operational and never personal — accounts, spend, the audit log, and
 * expressly not anyone's meals. A food query is a meal in her own words, so it
 * has no business on a page another owner can open. Same shape as `/requests`
 * and for the same two reasons: the production credential never leaves this
 * machine, and nobody's dinner is rendered to a browser.
 *
 * The number worth chasing is `gap`: the estimate against what she actually
 * filed afterwards. A guess nobody corrected is not evidence it was right —
 * it is silence, and it prints as a dash rather than as agreement.
 */
import { desc, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodEstimates } from "@/lib/db/schema";

const C = {
  dim: "\x1b[90m", bold: "\x1b[1m", reset: "\x1b[0m",
  bad: "\x1b[31m", ok: "\x1b[32m", warn: "\x1b[33m",
};

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const limit = Number(arg("limit") ?? 40);
  const wrongOnly = flag("wrong");

  const rows = await db.select().from(foodEstimates)
    .where(wrongOnly ? isNotNull(foodEstimates.loggedKcal) : undefined)
    .orderBy(desc(foodEstimates.at))
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 40);

  // "A plate answered as one food" is the failure this table was built the day
  // of: three things named, one counted, and a figure that looked reasonable.
  const plates = rows.filter((r) => r.source === "estimated" && (r.components ?? 0) <= 1
    && / (and|with|,|\+) /.test(` ${r.query} `));

  const scored = rows.map((r) => ({
    ...r,
    gap: r.loggedKcal !== null && r.kcal !== null && r.kcal > 0
      ? Math.round(((r.loggedKcal - r.kcal) / r.kcal) * 100)
      : null,
  }));
  const shown = flag("plates")
    ? scored.filter((r) => plates.includes(r as never))
    : wrongOnly
      ? scored.filter((r) => r.gap !== null).sort((a, b) => Math.abs(b.gap!) - Math.abs(a.gap!))
      : scored;

  if (shown.length === 0) {
    console.log(`${C.dim}Nothing recorded yet.${C.reset}`);
    process.exit(0);
  }

  for (const r of shown) {
    const when = r.at.toISOString().slice(0, 16).replace("T", " ");
    const said = r.kcal === null ? "—" : `${Math.round(r.kcal)} kcal`;
    const logged = r.loggedKcal === null ? `${C.dim}not logged${C.reset}` : `${r.loggedKcal} kcal`;
    const gap = r.gap === null
      ? ""
      : ` ${Math.abs(r.gap) > 25 ? C.bad : Math.abs(r.gap) > 10 ? C.warn : C.ok}${r.gap > 0 ? "+" : ""}${r.gap}%${C.reset}`;
    const parts = r.components === null ? "" : `${C.dim} ${r.components} component${r.components === 1 ? "" : "s"}${C.reset}`;
    console.log(`${C.dim}${when}${C.reset} ${C.bold}${r.query}${C.reset}`);
    console.log(`   ${r.source.padEnd(9)} said ${said} → logged ${logged}${gap}${parts}`
      + (r.carbsG === 0 ? ` ${C.warn}0g carbs${C.reset}` : ""));
  }

  const withGap = scored.filter((r) => r.gap !== null);
  const off = withGap.filter((r) => Math.abs(r.gap!) > 25);
  console.log();
  console.log(
    `${shown.length} shown · ${withGap.length} of ${rows.length} were logged afterwards`
    + (withGap.length ? ` · ${off.length} out by more than a quarter` : "")
    + (plates.length ? ` · ${C.warn}${plates.length} plate${plates.length === 1 ? "" : "s"} answered as one food${C.reset}` : ""),
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
