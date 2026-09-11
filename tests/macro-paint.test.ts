import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { barPaint, DEEPEN_MAX, macroBar, type MacroRow } from "@/lib/macro-progress";

const row = (over: Partial<MacroRow> = {}): MacroRow => ({
  key: "carbs", label: "Carbs", value: 100, target: 200, complete: true, suffix: "g", ...over,
});

suite("every macro gets a colour", () => {
  it("colours a floor instead of greying it out", () => {
    /*
      The floor was drawn in the neutral edge grey to mean "no verdict". On a
      real day that came out as calories and protein in colour and carbs, fat
      and fibre in grey — because some entry had carried no figure for those
      three. It reads as three macros the app cannot be bothered to colour,
      not as three numbers it cannot vouch for.
    */
    const floor = barPaint(macroBar(row({ complete: false })));
    expect(floor.role).toBe("--color-accent");
    expect(floor.hatched).toBe(true);
  });

  it("still says a floor is a floor", () => {
    // Coloured, but visibly provisional — the honesty is kept, the greying is
    // not the thing carrying it.
    expect(barPaint(macroBar(row({ complete: true }))).hatched).toBe(false);
    expect(barPaint(macroBar(row({ complete: false }))).hatched).toBe(true);
  });

  it("keeps the verdict colours for a day it can vouch for", () => {
    expect(barPaint(macroBar(row({ value: 300 }))).role).toBe("--color-miss");
    expect(barPaint(macroBar(row({ value: 200 }))).role).toBe("--color-beat");
    expect(barPaint(macroBar(row({ value: 50 }))).role).toBe("--color-accent");
  });
});

suite("it deepens as it approaches the target", () => {
  it("is lightest empty and richest at target", () => {
    expect(barPaint({ state: "under", fill: 0 }).depth).toBe(0);
    expect(barPaint({ state: "there", fill: 1 }).depth).toBe(DEEPEN_MAX);
    expect(barPaint({ state: "under", fill: 0.5 }).depth).toBe(Math.round(DEEPEN_MAX / 2));
  });

  it("cannot run past the deepest or before the lightest", () => {
    // `fill` is clamped for drawing, but a null or a stray value must not
    // produce a negative mix or one over 100.
    expect(barPaint({ state: "over", fill: 4 }).depth).toBe(DEEPEN_MAX);
    expect(barPaint({ state: "under", fill: -1 }).depth).toBe(0);
    expect(barPaint({ state: "unknown", fill: null }).depth).toBe(0);
  });

  it("darkens in a light palette too", () => {
    // `scrim` is the one token that is dark in every theme — see CLAUDE.md.
    // Mixing toward `ink` would lighten the bar in a light one.
    const src = fs.readFileSync("components/macro-bars.tsx", "utf8");
    expect(src).toMatch(/var\(--color-scrim\)/);
    expect(src).not.toMatch(/color-mix\(in srgb, var\(\$\{paint\.role\}\)[^)]*var\(--color-ink\)/);
  });

  it("is one gradient across the fill, not a flat block", () => {
    const src = fs.readFileSync("components/macro-bars.tsx", "utf8");
    expect(src).toMatch(/linear-gradient\(to right, var\(\$\{paint\.role\}\), color-mix\(/);
    // And the old flat class names are gone.
    expect(src).not.toMatch(/\? "bg-miss"/);
    expect(src).not.toMatch(/"bg-edge"/);
  });
});
