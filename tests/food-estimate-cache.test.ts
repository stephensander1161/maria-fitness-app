import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { estimateRow } from "@/lib/tools/foods";
import { FOODS as EXERCISE_FREE_FOODS } from "@/lib/seed/foods";

const guess = (over: Record<string, unknown> = {}) => ({
  food: "Cheese Quesadilla", grams: 200, kcal: 520, proteinG: 18,
  carbsG: 42, fatG: 28, fibreG: 2, category: "prepared" as const,
  note: "Varies by cheese and oil.",
  // One food, so this one is cacheable. A plate with three entries is not —
  // see the suite below.
  components: [{ name: "cheese quesadilla", grams: 200, kcal: 520, proteinG: 18, carbsG: 42, fatG: 28 }],
  ...over,
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

suite("what the estimator is asked for, and what it is allowed to keep", () => {
  const src = fs.readFileSync("lib/tools/foods.ts", "utf8");

  it("has to count every food named, not the most obvious one", () => {
    /*
      "2x pork chops with rice and green beans" came back as 420 calories and
      zero carbohydrate. The model answered for the chops and dropped the rice
      and the beans, and nothing in the shape of the request made that
      impossible — it was asked for "the food and portion described", which is
      a request for one food.

      A plate with two of its three components missing is the worst kind of
      wrong: the figure looks perfectly reasonable.
    */
    expect(src).toMatch(/components: z\.array\(/);
    expect(src).toMatch(/Count EVERY food named/);
    expect(src).toMatch(/A plate you have answered one component of is worse than no answer/);
    // And the zero that gave it away.
    expect(src).toMatch(/No macro may come back as zero when something named plainly carries it/);
    // An amount she gave is the amount, not 100g of the plate.
    expect(src).toMatch(/'2 pork chops' is a normal chop,/);
  });

  it("does not file a plate in the food library", () => {
    // The bad answer became a row called "pork chop", per 100g, from a figure
    // that had only counted the chops — so a one-off went into the shared
    // table and the next lookup found it.
    expect(src).toMatch(/if \(e\.components\.length > 1\) return;/);
  });

  it("does not file a guess for a food the library already has", () => {
    /*
      "A seeded row always wins, because the slug collides" only holds when the
      model names the food the way the seed did. It said "pork chop"; the seed
      calls it `pork-loin-chop-cooked` with "pork chop" as an alias. No
      collision — so the guess sat beside the real row and outranked it on an
      exact name match.
    */
    expect(src).toMatch(/matchScore\(e\.food, known\.name, known\.aliases\) <= 0\.5/);
    expect(src).toMatch(/known && !known\.estimated/);
  });

  it("writes down every answer it gives, and what she logged against it", () => {
    // "you better start recording the result every time someone clicks
    // calculate so that we can audit the predictions and improve them."
    expect(src).toMatch(/await db\.insert\(foodEstimates\)/);
    // And every lookup waits for its row. Fired and forgotten, the insert
    // was dropped when the function froze after the response — library
    // hits, the fastest path, left no trace, and "5x pieces of pizza"
    // (2026-09-18) could not be looked up after the fact.
    expect(src).not.toMatch(/\n\s*record\(ctx\.profileId/);
    expect(src).toMatch(/\): Promise<void> \{/);
    // All three outcomes, not only the interesting one.
    expect(src).toMatch(/source: "none"/);
    expect(src).toMatch(/components: parsed\.data\.components\.length/);
    // Her wording, before the parser tidied it — the parse is half of what
    // goes wrong, so the tidied version would hide it.
    expect(src).toMatch(/query: query\.slice\(0, 500\)/);
    const meals = fs.readFileSync("lib/tools/nutrition.ts", "utf8");
    expect(meals).toMatch(/void noteWhatWasLogged\(ctx\.profileId, input\.description/);
    // Never awaited: a record that fails must not fail her meal.
    expect(meals).toMatch(/\}\)\.catch\(\(\) => \{ \/\* see above \*\/ \}\);/);
  });
});

suite("a cup of lettuce is a question the app can answer", () => {
  const src = fs.readFileSync("lib/tools/foods.ts", "utf8");

  it("falls through to the estimate when the library cannot convert the measure", () => {
    /*
      2026-09-17, Maria's salad: "2 cups romaine lettuce, 1/2 cup cucumber,
      1/2 cup tomato, 1/2 cup chickpeas…". The library has all four, by the
      heart or by weight, and a cup is neither — so the lookup refused four of
      five with "has no per-item weight, so 0.5 cup can't be converted. Ask
      her for it in grams or ounces", the coach asked her to weigh her
      lettuce, and nothing was logged. "When she says cups it wants grams —
      it should be able to figure that out." The model can. The refusal
      survives only for a caller that has said it wants no estimate.
    */
    const branch = src.slice(src.indexOf("if (grams === null) {"), src.indexOf("if (grams === null) {") + 1200);
    expect(branch).toMatch(/if \(input\.allowEstimate !== false\) return estimate\(input\.query, ctx, portion\.query\);/);
    // The refusal still exists after it, for the caller that asked for it.
    expect(branch.indexOf("return estimate(")).toBeLessThan(branch.indexOf("has no per-item weight"));
  });

  it("does not refuse an estimate that forgot to enumerate", () => {
    // Asked for, not required: an answer without `components` is still an
    // answer, and refusing it left her with nothing at all.
    expect(src).toMatch(/\)\.default\(\[\]\),\n\s*grams: z\.number\(\)/);
  });

  it("records every failure with its reason", () => {
    /*
      "2 cups Roman lettuce" produced no `food_estimates` row at all: the
      failure paths returned before anything was recorded, so the one
      question that mattered — why — had no evidence. Every path records now.
    */
    expect(src).toMatch(/record\(ctx\.profileId, query, \{ source: "none", error: `spend gate: \$\{budget\.reason\}` \}\);/);
    expect(src).toMatch(/error: block\n\s*\? `schema: /);
    expect(src).toMatch(/record\(ctx\.profileId, query, \{ source: "none", error: `model: /);
    expect(fs.readFileSync("lib/db/schema.ts", "utf8")).toMatch(/error: text\("error"\),/);
    // And the calculator says the app's reason when there is one, rather than
    // "no match" for a food the library plainly knows.
    const ui = fs.readFileSync("components/today-food.tsx", "utf8");
    expect(ui).toMatch(/if \(!r\.found && r\.error && r\.code\) \{ setWhy\(r\.error\); setFailed\(true\); return; \}/);
    expect(ui).toMatch(/failed \? \(why \?\? "no match — type it"\) : label/);
  });

  it("knows the spelling she used", () => {
    const romaine = EXERCISE_FREE_FOODS.find((f) => f.slug === "lettuce-romaine");
    expect(romaine?.aliases).toContain("roman lettuce");
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
