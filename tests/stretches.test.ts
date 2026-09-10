import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { areasFor, coolDownFor, REST_DAY_FLOW, warmUpFor } from "@/lib/stretches";
import { EXERCISES } from "@/lib/seed/exercises";

const SEEDED = new Set(EXERCISES.map((e) => e.slug));

suite("warming up and cooling down", () => {
  it("only ever names movements that exist", () => {
    // The postpartum work nearly added parallel copies under new slugs and
    // tests/exercises.test.ts caught the duplicates. Forty-two mobility
    // movements were already seeded; this feature adds no content at all.
    const all = new Set([
      ...REST_DAY_FLOW,
      ...warmUpFor(["quads", "glutes", "shoulders", "chest", "lats", "calves", "core"], 99),
      ...coolDownFor(["quads", "glutes", "shoulders", "chest", "lats", "calves", "core"], 99),
    ]);
    const missing = [...all].filter((s) => !SEEDED.has(s));
    expect(missing, `not in the library: ${missing.join(", ")}`).toEqual([]);
  });

  it("follows the session rather than the calendar", () => {
    // Offering the same six every day is how a warm-up becomes something to
    // scroll past.
    const legs = warmUpFor(["quads", "glutes", "hamstrings"]);
    const press = warmUpFor(["chest", "shoulders"]);
    expect(legs).not.toEqual(press);
    expect(press.some((s) => /wall-slide|band-pass-through/.test(s))).toBe(true);
    expect(legs.some((s) => /hip|hinge/.test(s))).toBe(true);
  });

  it("never holds a stretch before lifting", () => {
    // Static stretching immediately before lifting measurably lowers force
    // output, and the effect is largest in the lifts she cares most about. So
    // the split is not stylistic: no slug may appear on both lists.
    const muscles = ["quads", "glutes", "hamstrings", "chest", "shoulders", "lats", "calves", "core"];
    const before = new Set(warmUpFor(muscles, 99));
    const both = coolDownFor(muscles, 99).filter((s) => before.has(s));
    expect(both, `on both the warm-up and the cool-down: ${both.join(", ")}`).toEqual([]);
  });

  it("gives every area its first choice before any area gets its second", () => {
    // Four hip stretches and nothing for the shoulders is not a warm-up for a
    // day that trained both.
    const picked = warmUpFor(["quads", "glutes", "hamstrings", "shoulders"], 4);
    expect(picked.some((s) => /wall-slide|band-pass-through|pendulum/.test(s))).toBe(true);
  });

  it("says nothing for a day that trains nothing", () => {
    expect(warmUpFor([])).toEqual([]);
    expect(coolDownFor([])).toEqual([]);
    expect(areasFor([])).toEqual([]);
    // A rest day still gets something — the card promised mobility work and
    // then offered none, which is the app naming a thing it does not do.
    expect(REST_DAY_FLOW.length).toBeGreaterThan(3);
  });

  it("maps the library's own muscle names", () => {
    // Keyed off primaryMuscles, so a movement added tomorrow is covered
    // without touching lib/stretches.ts.
    expect(areasFor(["glutes"])).toContain("hips");
    expect(areasFor(["upper back"])).toContain("thoracic");
    expect(areasFor(["calves"])).toEqual(expect.arrayContaining(["calves", "ankles"]));
    expect(areasFor(["nonsense muscle"])).toEqual([]);
  });
});

suite("where they appear", () => {
  const card = fs.readFileSync("components/train-client.tsx", "utf8");

  it("wraps the day, and fills the rest day's empty promise", () => {
    expect(card).toMatch(/title="Warm up"/);
    expect(card).toMatch(/title="Cool down"/);
    expect(card).toMatch(/items=\{stretchNames\(REST_DAY_FLOW\)\}/);
  });

  it("is closed by one line, so it costs nothing to ignore", () => {
    // A warm-up she has to scroll past to reach the first set makes the app
    // worse for the person who does not want one.
    const block = fs.readFileSync("components/stretch-block.tsx", "utf8");
    expect(block).toMatch(/useState\(tone === "rest"\)/);
    expect(block).toMatch(/aria-expanded=\{open\}/);
  });

  it("is askable, like everything else", () => {
    // A feature that only exists as a screen breaks the premise quietly: she
    // asks the coach, it says it can't, and she stops asking.
    const tools = fs.readFileSync("lib/tools/index.ts", "utf8");
    expect(tools).toMatch(/stretches\.getStretches/);
  });
});
