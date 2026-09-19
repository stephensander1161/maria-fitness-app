/**
 * Replay the food lookups the app has actually seen through Jev.
 *
 *   npm run jev:eval            the last 200 lookups
 *   npm run jev:eval -- 1000
 *
 * For every recorded lookup (lib/tools/foods.ts writes one per call) it asks
 * the decision the lookup would now make — this row, none, or unsure — and
 * prints how often that agrees with what the library ranking chose, and
 * where the model would have sent a query to the estimator instead. Read it
 * before trusting the thresholds in lib/food-match.ts; nothing is written.
 */
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodEstimates } from "@/lib/db/schema";
import { searchFoods } from "@/lib/tools/foods";
import { parsePortion } from "@/lib/portion";
import { chooseFood } from "@/lib/food-match";
import { jevConfigured } from "@/lib/jev";

async function main() {
  if (!jevConfigured()) throw new Error("JEV_API_KEY is not set");
  const limit = Number(process.argv[2] ?? 200);
  const rows = await db.select().from(foodEstimates).orderBy(desc(foodEstimates.at)).limit(limit);
  let agree = 0, differ = 0, none = 0, unsure = 0;
  for (const r of rows) {
    const portion = parsePortion(r.query);
    if (!portion) continue;
    const matches = await searchFoods(portion.query, 5);
    const v = await chooseFood(portion.query, matches);
    const ranked = matches[0]?.slug ?? null;
    const mark = v.kind === "unsure" ? "?" : v.kind === "none" ? "×" : v.row.slug === ranked ? "=" : "≠";
    if (v.kind === "unsure") unsure++; else if (v.kind === "none") none++; else if (v.row.slug === ranked) agree++; else differ++;
    if (mark !== "=") console.log(`${mark} ${r.query.padEnd(40).slice(0, 40)} ranked=${ranked ?? "-"} ${v.kind === "row" ? `→ ${v.row.slug} (${v.confidence.toFixed(2)})` : v.kind === "none" ? `→ none (${v.confidence.toFixed(2)})` : ""} was:${r.source}`);
  }
  console.log(`\n${rows.length} lookups · agrees with ranking ${agree} · picks a different row ${differ} · says none ${none} · unsure ${unsure}`);
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
