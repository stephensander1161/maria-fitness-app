import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { trendRows } from "@/lib/progress";

suite("this week against last, as numbers — 2026-09-18", () => {
  // "Do you think the moved up / came up short card should just be removed
  // outright? Or maybe replaced by the volume trend, the wall of text is ugly."
  const m = (name: string, status: "beat" | "matched" | "missed", pct: number | null) => ({ name, status, volumeDeltaPct: pct });

  it("biggest change first, level ones behind a count, the rest behind another", () => {
    const rows = trendRows([m("Squat", "beat", 4), m("Bench", "missed", -12), m("Row", "matched", 0), m("Curl", "beat", 30)], 2);
    expect(rows.rows.map((r) => r.name)).toEqual(["Curl", "Bench"]);
    expect(rows.more).toBe(1);
    expect(rows.level).toBe(1);
  });

  it("copes with nothing and with no percentage", () => {
    expect(trendRows([])).toEqual({ rows: [], more: 0, level: 0 });
    expect(trendRows([m("Plank", "beat", null)]).rows[0].volumeDeltaPct).toBeNull();
  });

  it("is what Progress draws — every row, scrolling — and the two lists of sentences are gone", () => {
    // "Make against last week scrollable so it doesn't just say plus 11
    // more; since the card never fully goes away, keep the eye to unhide
    // right from there."
    const page = fs.readFileSync("app/progress/page.tsx", "utf8");
    expect(page).toMatch(/const vsLastWeek = trendRows\(review\.movements, Infinity\)/);
    expect(page).toMatch(/max-h-64 divide-y divide-line\/60 overflow-y-auto/);
    expect(page).toMatch(/<HideCard id="weekReview" what="this week against last" hidden=\{!showReview\} \/>/);
    expect(fs.readFileSync("components/hide-card.tsx", "utf8")).toMatch(/collapsed: !hidden/);
    expect(page).toMatch(/Against last week/);
    expect(page).not.toMatch(/title="Moved up"|title="Came up short"/);
    expect(page).not.toMatch(/const List = /);
  });
});
