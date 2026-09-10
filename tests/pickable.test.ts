import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const views = fs.readFileSync("lib/views.ts", "utf8");
const picker = fs.readFileSync("components/movement-picker.tsx", "utf8");
const pick = views.slice(views.indexOf("export async function pickableExercises"));

suite("what she owns marks the library, it does not cut it", () => {
  it("builds the groups from every movement, not the usable ones", () => {
    // Say "dumbbells" once during setup and the barbell bench press stopped
    // existing — not hidden with a reason, *gone*, because it has no hard
    // `requires` and so was not in the blocked list either. That answer is a
    // fact about one room on one day; people buy a rack, and train somewhere
    // on Thursdays that has everything.
    expect(pick).toMatch(/const items = rows\n\s*\.filter\(\(r\) => groupForExercise\(r\) === group\)/);
    expect(pick).not.toMatch(/rows\.filter\(can\)/);
    expect(pick).not.toMatch(/const usable/);
  });

  it("carries whether she has the kit, and the one thing she is missing", () => {
    expect(views).toMatch(/have: boolean;/);
    expect(views).toMatch(/missing: string \| null;/);
    expect(pick).toMatch(/have: can\(\{ equipment: r\.equipment, requires: r\.requires \}\)/);
    // Hers first, so the list still opens on what she can do right now.
    expect(pick).toMatch(/\.sort\(\(a, b\) => \(a\.have === b\.have \? 0 : a\.have \? -1 : 1\)\)/);
  });

  it("the picker says what is missing instead of dropping it", () => {
    expect(picker).toMatch(/needs \{i\.missing\}/);
    // And the banner that explained the old filter is gone with the filter.
    expect(picker).not.toMatch(/unavailable/);
    expect(picker).not.toMatch(/Add it in plan setup/);
  });

  it("the shortest honest answer, not the whole equipment list", () => {
    // A barbell bench press wants a barbell — not "a barbell or a bench or a
    // full gym", which is what its `equipment` array literally says.
    expect(pick).toMatch(/const needs = r\.equipment\.filter\(\(e\) => !\/full gym\|none\/i\.test\(e\)\)/);
    expect(pick).toMatch(/return needs\[0\] \?\? null/);
  });
});
