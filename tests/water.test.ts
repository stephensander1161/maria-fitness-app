import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  formatWater, parseWater, summariseWater, waterSignal, waterState, waterTarget,
  WATER_MAX_ML, WATER_MIN_ML, WATER_TARGET_DEFAULT_ML,
} from "@/lib/water";
import { registry } from "@/lib/tools";
import { FACTS } from "@/lib/seed/facts";

suite("reading an amount she said", () => {
  it("takes the ways people say a drink", () => {
    expect(parseWater("500ml")).toBe(500);
    expect(parseWater("1.5L")).toBe(1500);
    expect(parseWater("2 litres")).toBe(2000);
    expect(parseWater("16oz")).toBe(473);
    expect(parseWater("a pint")).toBe(568);
    expect(parseWater("a glass")).toBe(250);
    expect(parseWater("2 glasses")).toBe(500);
    expect(parseWater("3 cups")).toBe(711);
  });

  it("refuses a bare number rather than guessing", () => {
    /*
      "2" is two litres or two ounces and those are a hundredfold apart. Every
      reading is plausible for a real drink, so there is no safe default — the
      same call `toGrams` makes for "1 glass rice".
    */
    expect(parseWater("2")).toBeNull();
    expect(parseWater("500")).toBeNull();
  });

  it("refuses nonsense and anything outside sensible bounds", () => {
    expect(parseWater("")).toBeNull();
    expect(parseWater("loads")).toBeNull();
    expect(parseWater("1ml")).toBeNull();
    expect(parseWater(`${WATER_MAX_ML + 1}ml`)).toBeNull();
    expect(parseWater(`${WATER_MIN_ML}ml`)).toBe(WATER_MIN_ML);
  });
});

suite("writing it back in her units", () => {
  it("uses litres past a litre, and never invents precision", () => {
    expect(formatWater(750, "metric")).toBe("750 ml");
    expect(formatWater(1500, "metric")).toBe("1.5 L");
    expect(formatWater(2000, "metric")).toBe("2 L");
    expect(formatWater(473, "imperial")).toBe("16 fl oz");
  });

  it("shows a dash for nothing, never a zero", () => {
    expect(formatWater(null, "metric")).toBe("—");
    expect(formatWater(undefined, "imperial")).toBe("—");
  });
});

suite("unknown is not zero, here as everywhere", () => {
  it("a day with no rows is unknown, not a dry day", () => {
    // Water is the easiest thing in this app to forget to log, which is
    // exactly why nothing here may report an unlogged day as a miss.
    expect(waterState(null, 2000)).toBe("unknown");
    // …and an actual zero is a different answer.
    expect(waterState(0, 2000)).toBe("none");
    expect(waterState(1500, 2000)).toBe("close");
    expect(waterState(600, 2000)).toBe("low");
    expect(waterState(2000, 2000)).toBe("there");
  });

  it("says nothing to the coach about a day she has not logged", () => {
    // The model believes the state block completely, so "she has drunk 0 ml"
    // would have it telling her to drink when she may have had two litres.
    expect(waterSignal(null, 2000, "metric")).toBeNull();
    expect(waterSignal(1200, 2000, "metric")).toMatch(/1\.2 L of a 2 L target/);
  });

  it("refuses to average a window mostly not written down", () => {
    const days = (logged: number, total: number) =>
      Array.from({ length: total }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, "0")}` as const,
        ml: i < logged ? 2000 : null,
      }));
    // Four days of fourteen averaged across fourteen reports a third of what
    // she drank, and it reads as her failing.
    expect(summariseWater(days(4, 14), 2000).meanMl).toBeNull();
    expect(summariseWater(days(4, 14), 2000).confidence).toBe("under-logged");
    // …and two days is too few however short the window.
    expect(summariseWater(days(2, 2), 2000).meanMl).toBeNull();
    const good = summariseWater(days(12, 14), 2000);
    expect(good.meanMl).toBe(2000);
    expect(good.daysOnTarget).toBe(12);
  });
});

suite("her target", () => {
  it("falls back to the default, and zero is not a target", () => {
    expect(waterTarget({})).toBe(WATER_TARGET_DEFAULT_ML);
    expect(waterTarget({ waterTargetMl: null })).toBe(WATER_TARGET_DEFAULT_ML);
    expect(waterTarget({ waterTargetMl: 0 })).toBe(WATER_TARGET_DEFAULT_ML);
    expect(waterTarget({ waterTargetMl: 3000 })).toBe(3000);
  });
});

suite("it ships its tools", () => {
  it("can be logged, read, corrected and re-targeted by voice", () => {
    // A feature that only exists as a screen breaks this app's premise: she
    // asks the coach, it says it can't, and she stops asking.
    for (const name of ["log_water", "get_water", "set_water_target", "remove_water_log"]) {
      expect(registry.get(name), name).toBeDefined();
      // Leading with what it does. One that opens with a constraint reads as
      // a refusal.
      expect(registry.get(name)!.description.length, name).toBeGreaterThan(80);
    }
  });

  it("never lets the model do the unit arithmetic", () => {
    // Millilitres underneath, her units at the boundary — the house rule.
    const src = fs.readFileSync("lib/tools/water.ts", "utf8");
    expect(src).toMatch(/formatWater\(/);
    expect(src).not.toMatch(/ml \/ 1000/);
  });

  it("scopes a delete to her profile in the query itself", () => {
    const src = fs.readFileSync("lib/tools/water.ts", "utf8");
    const del = src.slice(src.indexOf("db.delete(waterLogs)"));
    expect(del.slice(0, 200)).toMatch(/eq\(waterLogs\.profileId, ctx\.profileId\)/);
  });

  it("is in the nightly backup and admitted to in the policy", () => {
    expect(fs.readFileSync("lib/backup.ts", "utf8")).toMatch(/waterLogs/);
    expect(fs.readFileSync("lib/legal.ts", "utf8")).toMatch(/water you log/);
  });
});

suite("the library has something to say about it", () => {
  it("carries water facts, each with a source", () => {
    const water = FACTS.filter((f) => f.slug.startsWith("water-"));
    expect(water.length).toBeGreaterThanOrEqual(8);
    for (const f of water) expect(f.source, f.slug).toBeTruthy();
  });

  it("and does not repeat the eight-glasses myth as fact", () => {
    const myth = FACTS.find((f) => f.slug === "water-eight-glasses")!;
    expect(myth.text).toMatch(/no research behind it/);
  });
});
