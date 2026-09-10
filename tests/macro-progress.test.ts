import { describe as suite, expect, it } from "vitest";
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
