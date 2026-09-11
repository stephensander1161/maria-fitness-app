import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { afterLogLine, macroBar, ON_TARGET_BAND, OVER_BAND, type MacroRow } from "@/lib/macro-progress";

const row = (over: Partial<MacroRow> = {}): MacroRow => ({
  key: "calories", label: "Calories", value: 1000, target: 2000, complete: true, suffix: "", ...over,
});

suite("where the day stands, and what may be said about it", () => {
  it("refuses a verdict on a total that is only a floor", () => {
    // "≥1150 of 2000" is not 850 short — it is at least 1150 and nobody knows
    // the rest. Drawing that as a half-empty bar tells her to eat more on a
    // day she may already be over.
    const b = macroBar(row({ value: 1150, complete: false }));
    expect(b.state).toBe("unknown");
    expect(b.over).toBe(0);
    // It still draws — she can see roughly where she is, just uncoloured.
    expect(b.fill).toBeCloseTo(0.575, 2);
  });

  it("is generous about what counts as hitting it", () => {
    // A card that says "over" at 2010 of 2000 is wrong every day and teaches
    // her to ignore it.
    expect(macroBar(row({ value: 2000 * (1 - ON_TARGET_BAND) })).state).toBe("there");
    expect(macroBar(row({ value: 2010 })).state).toBe("there");
    expect(macroBar(row({ value: 2000 * (1 + OVER_BAND) + 1 })).state).toBe("over");
    expect(macroBar(row({ value: 1200 })).state).toBe("under");
  });

  it("says how far over, in the row's own unit", () => {
    expect(macroBar(row({ value: 2400 })).over).toBe(400);
    expect(macroBar(row({ value: 1200 })).over).toBe(0);
  });

  it("has nothing to draw without a target", () => {
    const b = macroBar(row({ target: null }));
    expect(b.state).toBe("unknown");
    expect(b.fill).toBeNull();
  });

  it("never scolds her for going over", () => {
    // Going over is information for the next meal, not a verdict on the day.
    // "You are over" said warmly at four in the afternoon is the difference
    // between logging dinner and not logging it.
    const bars = [macroBar(row({ value: 2400 }))];
    const line = afterLogLine(bars);
    expect(line.tone).toBe("warn");
    expect(line.text).toMatch(/one day does not decide anything/);
    expect(line.text).not.toMatch(/too much|failed|blew|ruined|should have/i);
  });

  it("leads with protein when protein is in", () => {
    const bars = [
      macroBar(row({ value: 1500 })),
      macroBar(row({ key: "protein", label: "Protein", value: 160, target: 160, suffix: "g" })),
    ];
    expect(afterLogLine(bars).tone).toBe("good");
    expect(afterLogLine(bars).text).toMatch(/Protein target hit/);
  });
});

suite("a blank macro greys the whole day, and the app says why", () => {
  const nutrition = fs.readFileSync("lib/tools/nutrition.ts", "utf8");
  const log = nutrition.slice(nutrition.indexOf('name: "log_meal"'), nutrition.indexOf('name: "log_planned_day"'));

  it("asks for carbs and fat, not only calories and protein", () => {
    /*
      A real day: "Protein shake" logged as 147 kcal and 25g protein with
      nothing else, which made the carb and fat bars floors for the whole day
      — every other entry on it carefully filled in and greyed out anyway.
      Nothing in the schema had ever asked the model for those two.
    */
    expect(log).toMatch(/carbsG: wholeGramsOptional\s*\n\s*\.describe\(/);
    expect(log).toMatch(/fatG: wholeGramsOptional\s*\n\s*\.describe\(/);
  });

  it("names the gaps on the way back out", () => {
    // The input description is read once at the start of a turn; this is read
    // straight after the write, while she is still looking at the meal.
    expect(log).toMatch(/loggedWithout/);
    expect(log).toMatch(/update_meal_log with logId/);
  });

  it("counts a blank, never a zero", () => {
    expect(log).toMatch(/\.filter\(\(\[, v\]\) => v === null\)/);
  });
});

suite("every screen draws the same list", () => {
  it("Progress shows fibre too", () => {
    // Eat showed six rows and Progress five, which reads as the app not
    // tracking fibre rather than as a list somebody forgot to extend.
    const progress = fs.readFileSync("app/progress/page.tsx", "utf8");
    const rows = progress.slice(progress.indexOf("const macroRows"), progress.indexOf("];", progress.indexOf("const macroRows")));
    for (const key of ["calories", "protein", "carbs", "fat", "fibre"]) {
      expect(rows, key).toContain(`key: "${key}"`);
    }
    expect(rows).toContain("waterRow(");
  });
});

suite("an empty meter looks empty, not absent", () => {
  it("draws the track in a token that is not the card behind it", () => {
    // On Eat the bars sit inside a `bg-raised` box and the track was also
    // `bg-raised`, so a macro at zero had no visible bar at all.
    const bars = fs.readFileSync("components/macro-bars.tsx", "utf8");
    expect(bars).toMatch(/rounded-full bg-line/);
    expect(bars).not.toMatch(/rounded-full bg-raised/);
    expect(fs.readFileSync("components/today-food.tsx", "utf8")).toMatch(/bg-raised p-3">\s*<MacroBars/);
  });

  it("and a zero still has a bar to be empty of", () => {
    // fill is 0, not null: null means no target and draws nothing at all.
    expect(macroBar(row({ value: 0, target: 30, complete: false })).fill).toBe(0);
    expect(macroBar(row({ value: 0, target: null })).fill).toBeNull();
  });
});
