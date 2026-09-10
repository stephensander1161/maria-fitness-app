import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { FOODS } from "@/lib/seed/foods";

const src = fs.readFileSync("lib/tools/foods.ts", "utf8");
const nutrition = fs.readFileSync("lib/tools/nutrition.ts", "utf8");

suite("looking a food up", () => {
  it("matches the spelling with the spaces taken out", () => {
    // "hotdog" is one word to everybody who types it and two in the table, so
    // a single ILIKE on what she typed found nothing and the model estimated
    // instead: 290 kcal for one sausage against the 131 the table gives.
    expect(src).toMatch(/const squashed = q\.replace\(\/\[\\s-\]\/g, ""\)/);
    expect(src).toMatch(/lower\(replace\(replace\(\$\{foods\.name\}/);
    // Short queries are left out, or "egg" starts matching everything.
    expect(src).toMatch(/squashed\.length >= 4/);
  });

  it("takes no amount to mean one of the thing, not 100g", () => {
    // 100g is a safe-looking default that is wrong for almost everything with
    // a natural portion, and wrong in the direction that inflates her day.
    expect(src).toMatch(/const assumedOne = portion\.assumed && best\.unitGrams !== null/);
    expect(src).toMatch(/assumedOne\n\s*\? best\.unitGrams!/);
    // And it says which was filled in, so the reply can read it back.
    expect(src).toMatch(/assumed: portion\.assumed \? \(assumedOne \? `one \$\{/);
  });

  it("has a portion for the things that come in ones", () => {
    // The default only helps where the row knows what one of it weighs.
    const withUnit = FOODS.filter((f) => f.unitGrams !== null);
    expect(withUnit.length / FOODS.length).toBeGreaterThan(0.9);
    // A cube of cheese is about a third of a matchbox portion, and aliasing
    // one onto the other made "4 cheese cubes" 499 calories.
    const cube = FOODS.find((f) => f.slug === "cheese-cubes");
    expect(cube?.unitGrams).toBe(9);
    expect(FOODS.find((f) => f.slug === "cheddar")?.aliases).not.toContain("cheese cubes");
  });
});

suite("pricing a whole plate in one call", () => {
  it("prices the items itself rather than fanning out lookups", () => {
    // Four lookups plus the round trip to read them back took the turn past
    // its deadline, so the write it existed to make was refused.
    expect(nutrition).toMatch(/async function priceItems/);
    expect(nutrition).toMatch(/items: z\.array\(z\.string\(\)\)\.optional\(\)/);
    expect(nutrition).toMatch(/const priced = input\.items\?\.length \? await priceItems/);
  });

  it("refuses rather than logging a partial sum as a total", () => {
    // Three of four items missing would have logged the barbecue sauce and
    // called the lunch 29 calories — a number that looks exact and is wrong
    // by six hundred.
    expect(nutrition).toMatch(/if \(priced && priced\.unpriced\.length > 0 && input\.calories === undefined/);
    expect(nutrition).toMatch(/Nothing was logged\. The library has no figures for/);
  });

  it("and never sums an unknown fibre as zero", () => {
    // The most repeated bug class in this app.
    expect(nutrition).toMatch(/let fibreKnownForAll = true/);
    expect(nutrition).toMatch(/fibreG: fibreKnownForAll \? round\(fibreG\) : null/);
  });
});
