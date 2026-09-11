import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const field = fs.readFileSync("components/number-field.tsx", "utf8");
const card = fs.readFileSync("components/train-client.tsx", "utf8");

suite("a weight nobody knows is not zero", () => {
  it("renders blank rather than 0 when there is nothing to suggest", () => {
    // The first set of a movement she has never done has no weight to seed
    // from — no history, and a plan that named none. It rendered as 0, which
    // is this app's oldest bug class arriving on a screen: a nought reads as a
    // suggestion, and it is one she has to clear before she can type.
    expect(field).toMatch(/const blank = \(n: number\) => \(blankAtZero && n === 0 \? "" : String\(n\)\)/);
    expect(field).toMatch(/useState\(blank\(value\)\)/);
    // And the re-seed on a new set goes through the same rule.
    expect(field).toMatch(/setDraft\(blank\(value\)\)/);
  });

  it("is only the weight, never the count", () => {
    // Reps always have a target worth showing, and a blank rep field would be
    // a question with an obvious answer.
    const entry = card.slice(card.indexOf("label={`Weight (${unit})`}"), card.indexOf("label={count.label}"));
    expect(entry).toMatch(/blankAtZero/);
    const count = card.slice(card.indexOf("label={count.label}"), card.indexOf("label={count.label}") + 600);
    expect(count).not.toMatch(/blankAtZero/);
  });

  it("stops being blank once she names a number, even zero", () => {
    // Tapping the minus stepper down to 0 is her saying bodyweight, which is
    // different from nobody having said anything.
    const nudge = field.slice(field.indexOf("const nudge ="), field.indexOf("const nudge =") + 400);
    expect(nudge).toMatch(/setDraft\(String\(next\)\)/);
    expect(nudge).not.toMatch(/blank\(/);
  });
});

suite("typing replaces the number, on a phone too", () => {
  it("re-selects after the frame iOS places its caret in", () => {
    // iOS sets the caret on touch-end, *after* focus, which collapses a
    // selection made in the focus handler — so the seeded number is appended
    // to rather than replaced, and typing 135 over 95 gives 95135.
    expect(field).toMatch(/requestAnimationFrame\(\(\) => \{/);
    expect(field).toMatch(/if \(document\.activeElement === el\) el\.select\(\)/);
    // Guarded, because she may have moved on before the frame ran.
    expect(field).toMatch(/document\.activeElement === el/);
  });
});
