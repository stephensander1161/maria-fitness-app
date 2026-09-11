import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { estimateRow } from "@/lib/tools/foods";

const guess = (over: Record<string, unknown> = {}) => ({
  food: "Cheese Quesadilla", grams: 200, kcal: 520, proteinG: 18,
  carbsG: 42, fatG: 28, fibreG: 2, category: "prepared" as const,
  note: "Varies by cheese and oil.", ...over,
});

suite("an estimate is kept so it is not paid for twice", () => {
  it("stores it per 100g, like every other row", () => {
    // Every lookup of a food the library has never heard of costs a model
    // call, and the foods people eat repeat — Tuesday's quesadilla is the same
    // arithmetic on Thursday.
    const row = estimateRow(guess(), "cheese quesadilla");
    expect(row?.kcal).toBe(260);
    expect(row?.proteinG).toBe(9);
    expect(row?.fibreG).toBe(1);
  });

  it("marks it, so it can never pass for library data", () => {
    /*
      It is in the curated table so the next lookup is free, not so a guess
      can quietly become a fact. The flag is what keeps "Estimated — not from
      the library" on the card, and the note is what keeps the caveat with it.
    */
    const row = estimateRow(guess(), "cheese quesadilla");
    expect(row?.estimated).toBe(true);
    expect(row?.note).toBe("Varies by cheese and oil.");
    const src = fs.readFileSync("lib/tools/foods.ts", "utf8");
    expect(src).toMatch(/source: best\.estimated \? "estimated" : "library"/);
  });

  it("keeps her wording as an alias when the model renamed it", () => {
    // The cache keys on the food's name, and the model names things its own
    // way — anything it tidies would miss, and the second lookup would pay
    // again for an answer already on the table.
    expect(estimateRow(guess({ food: "Quesadilla, cheese" }), "cheese quesadilla")?.aliases)
      .toEqual(["cheese quesadilla"]);
    // And does not repeat the name back at itself.
    expect(estimateRow(guess({ food: "cheese quesadilla" }), "cheese quesadilla")?.aliases).toEqual([]);
  });

  it("refuses to divide by nothing", () => {
    // A zero-gram estimate would write Infinity into every column of a table
    // everybody reads.
    for (const grams of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimateRow(guess({ grams }), "x"), String(grams)).toBeNull();
    }
  });

  it("carries a missing fibre through as unknown, not zero", () => {
    expect(estimateRow(guess({ fibreG: null }), "x")?.fibreG).toBeNull();
    expect(estimateRow(guess({ fibreG: undefined }), "x")?.fibreG).toBeNull();
  });

  it("never overwrites a row that is already there", () => {
    // The first answer for a name is the one that stays, so a later lookup
    // cannot move a number she has already logged a meal against — and a
    // seeded row always wins, because a real figure beats a guess.
    const src = fs.readFileSync("lib/tools/foods.ts", "utf8");
    expect(src).toMatch(/onConflictDoNothing\(\{ target: foods\.slug \}\)/);
  });

  it("does not fail the lookup she has already paid for", () => {
    const src = fs.readFileSync("lib/tools/foods.ts", "utf8");
    expect(src).toMatch(/void remember\(parsed\.data, portionQuery\)\.catch\(/);
  });
});

suite("the calculator draws five numbers one way", () => {
  it("gives every macro the calorie figure's weight", () => {
    // They arrived three ways: calories big and bold, protein and fibre in
    // boxes, carbs and fat as a line of grey text — which ranked them by
    // typeface rather than by anything true.
    const src = fs.readFileSync("components/calorie-calculator.tsx", "utf8");
    expect(src).toMatch(/grid grid-cols-4/);
    expect(src).toMatch(/\["Protein", result\.proteinG\]/);
    expect(src).toMatch(/\["Fibre", result\.fibreG\]/);
    // No leftover grey footnote line.
    expect(src).not.toMatch(/g carbs · /);
    // …and one style, not a `strong` variant for two of them.
    expect(src).not.toMatch(/strong\?: boolean/);
  });

  it("still writes a dash for a macro nobody knows", () => {
    const src = fs.readFileSync("components/calorie-calculator.tsx", "utf8");
    expect(src).toMatch(/grams === undefined \|\| grams === null \? "—"/);
  });
});
