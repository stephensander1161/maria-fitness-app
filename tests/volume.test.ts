import { describe as suite, expect, it } from "vitest";
import { muscleGroup, volumeBrief, weeklyVolume } from "@/lib/volume";

const set = (...muscles: string[]) => ({ muscles });

suite("grouping the library's muscles", () => {
  it("folds the names a library uses into the ones a person thinks in", () => {
    expect(muscleGroup("lats")).toBe("Back");
    expect(muscleGroup("rear delts")).toBe("Shoulders");
    expect(muscleGroup("Quads")).toBe("Legs");
  });

  it("drops what no landmark applies to rather than inventing a bucket", () => {
    // A set of grip work is not a set of anything these numbers describe.
    expect(muscleGroup("grip")).toBeNull();
    expect(muscleGroup("cardiovascular")).toBeNull();
  });
});

suite("counting a week", () => {
  it("counts one set once per group, not once per muscle", () => {
    // A row lists lats, upper back and rhomboids. That is one set of Back.
    const v = weeklyVolume([set("lats", "upper back", "rhomboids")]);
    expect(v.groups.find((g) => g.group === "Back")!.sets).toBe(1);
  });

  it("counts a set that works two groups against both", () => {
    const v = weeklyVolume([set("glutes", "core")]);
    expect(v.groups.find((g) => g.group === "Legs")!.sets).toBe(1);
    expect(v.groups.find((g) => g.group === "Core")!.sets).toBe(1);
  });

  it("says when a group is thin and when it is already plenty", () => {
    const v = weeklyVolume([
      ...Array.from({ length: 20 }, () => set("shoulders")),
      ...Array.from({ length: 2 }, () => set("quads")),
    ]);
    expect(v.groups.find((g) => g.group === "Shoulders")!.status).toBe("above");
    expect(v.groups.find((g) => g.group === "Legs")!.status).toBe("below");
    expect(v.groups.find((g) => g.group === "Chest")!.status).toBe("below");
  });

  it("reports what it could not classify instead of hiding it", () => {
    const v = weeklyVolume([set("grip"), set("neck"), set("quads")]);
    expect(v.unmapped).toBe(2);
  });

  it("hands the planner the imbalance in a sentence", () => {
    const v = weeklyVolume([
      ...Array.from({ length: 20 }, () => set("shoulders")),
      ...Array.from({ length: 2 }, () => set("quads")),
    ]);
    const brief = volumeBrief(v);
    expect(brief).toMatch(/Shoulders 20/);
    expect(brief).toMatch(/Light on:.*Legs/);
    expect(brief).toMatch(/do not add more/);
  });
});
