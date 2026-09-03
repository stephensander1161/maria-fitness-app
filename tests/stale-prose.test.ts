import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { REST_DAY_NOTES } from "@/lib/seed/workout-templates";

/**
 * Prose goes stale silently, and it is believed more than anything else on
 * the screen — it is the only part written in sentences.
 *
 * Two cases have already bitten. A rest day kept telling her a walk does more
 * for tomorrow than training, on a day she had just put a workout on. And the
 * week's blurb went on describing "three full-body sessions with a pair of
 * dumbbells" after she added a fourth day and swapped half the movements.
 *
 * Both are the same bug: a sentence written about a specific state, left
 * behind when the state changed. These check that every tool which changes
 * that state clears the sentence with it.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("a plan's blurb does not outlive the plan it describes", () => {
  it("every structural edit to the training week clears the rationale", () => {
    const training = read("lib/tools/training.ts");
    // Adding or removing a movement changes the shape of the week.
    expect(training).toMatch(/async function rationaleNoLongerApplies/);
    const calls = training.match(/rationaleNoLongerApplies\(/g) ?? [];
    // The definition, plus add_exercise_to_day and remove_exercise_from_day.
    expect(calls.length, "add and remove must both clear it").toBeGreaterThanOrEqual(3);

    // Swapping one movement for another does too.
    expect(read("lib/tools/swaps.ts")).toMatch(/plans\)\.set\(\{ rationale: null \}\)/);
  });

  it("every structural edit to the meal week clears the rationale", () => {
    expect(read("lib/tools/nutrition.ts")).toMatch(/mealPlans\)\.set\(\{ rationale: null \}\)/);
    expect(read("lib/tools/corrections.ts")).toMatch(/mealPlans\)\.set\(\{ rationale: null \}\)/);
  });
});

suite("a rest day stops talking like one", () => {
  it("knows every note the templates put on a rest day", () => {
    // Built from the templates rather than listed by hand, so it cannot drift
    // from what is actually seeded.
    expect(REST_DAY_NOTES.size).toBeGreaterThan(10);
    expect(REST_DAY_NOTES.has(
      "Rest day. A twenty-minute walk does more for tomorrow's session than sitting still does.",
    )).toBe(true);
    // The one that does not begin with "Rest" — the reason this is a set of
    // real strings and not a regular expression.
    expect([...REST_DAY_NOTES].some((n) => !/^rest/i.test(n))).toBe(true);
  });

  it("judges the note separately from the title", () => {
    // Renaming "Rest" to "chest" fixed the heading and left the note beneath
    // it saying a walk beats training. That is exactly what happened.
    const views = read("lib/views.ts");
    expect(views).toMatch(/REST_DAY_NOTES\.has\(day\.notes\)/);
    const training = read("lib/tools/training.ts");
    expect(training).toMatch(/REST_DAY_NOTES\.has\(found\.day\.notes\)/);
  });
});
