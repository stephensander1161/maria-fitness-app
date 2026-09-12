import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CHAIN_FOODS } from "@/lib/seed/chain-foods";
import { FOODS } from "@/lib/seed/foods";
import { itemCount, parsePortion } from "@/lib/portion";

/*
  His ask: "look up menus of all the fast food chains and add their menus and
  macros to our db so we can have accurate data, then 'small McDonald's fries'
  is always right."
*/

suite("a menu item is counted, not weighed", () => {
  it("reads no amount as one of the thing", () => {
    // "small mcdonalds fries" is one small fries. It is the whole point.
    const p = parsePortion("small mcdonalds fries")!;
    expect(itemCount(p, null)).toBe(1);
  });

  it("multiplies a bare count", () => {
    expect(itemCount(parsePortion("2 big macs")!, null)).toBe(2);
  });

  it("refuses a weight when the chain never printed one", () => {
    /*
      Every chain publishes "1 sandwich — 520 kcal" and almost none publishes
      what it weighs. Answering "150g of Big Mac" would mean inventing a
      density; the same refusal `toGrams` gives for a glass of rice.
    */
    expect(itemCount(parsePortion("150g big mac")!, null)).toBeNull();
    expect(itemCount(parsePortion("4oz big mac")!, null)).toBeNull();
  });

  it("…and converts one where the chain did print it", () => {
    // A small fries is 75g on the panel, so half of one is answerable.
    expect(itemCount(parsePortion("150g fries")!, 75)).toBe(2);
  });
});

suite("what goes in the library", () => {
  it("is all per item, and all branded", () => {
    for (const f of CHAIN_FOODS) {
      expect(f.perItem, f.slug).toBe(true);
      expect(f.brand, f.slug).toBeTruthy();
      expect(f.unitLabel, f.slug).toBeTruthy();
    }
  });

  it("carries available carbohydrate, not the total off the panel", () => {
    /*
      Every nutrition panel prints total carbohydrate with the fibre inside it;
      this app's `carbsG` is what is left after fibre, like every other row in
      the library. Getting it backwards is the chia-seed bug from CLAUDE.md, at
      scale — and the tell is a row whose carbs and fibre add up past its
      calories.
    */
    for (const f of CHAIN_FOODS) {
      const fromMacros = f.carbsG * 4 + f.proteinG * 4 + f.fatG * 9;
      // Fibre and sugar alcohols make this approximate, so the check is only
      // that the row is not wildly impossible — a doubled carb figure is.
      expect(fromMacros, `${f.slug}: macros imply ${Math.round(fromMacros)} kcal against ${f.kcal}`)
        .toBeLessThan(f.kcal * 1.35 + 60);
    }
  });

  it("never collides with the generic library", () => {
    const generic = new Set(FOODS.map((f) => f.slug));
    for (const f of CHAIN_FOODS) expect(generic.has(f.slug), f.slug).toBe(false);
    const seen = new Set<string>();
    for (const f of CHAIN_FOODS) {
      expect(seen.has(f.slug), `duplicate ${f.slug}`).toBe(false);
      seen.add(f.slug);
    }
  });

  it("is findable the way people say it", () => {
    // "mcdonalds large fries", not "Fries, large". The chain name is in the
    // aliases because it is in the sentence.
    for (const f of CHAIN_FOODS) {
      expect(f.aliases.length, f.slug).toBeGreaterThan(0);
    }
    // Names count too — `searchFoods` matches the name and the aliases, and
    // "Big Mac" is already the name.
    const all = CHAIN_FOODS.flatMap((f) => [f.name.toLowerCase(), ...f.aliases]);
    for (const said of ["mcdonalds small fries", "big mac", "iced capp", "timbit"]) {
      expect(all, said).toContain(said);
    }
  });

  it("says plainly that these are Canadian figures", () => {
    // A medium McDonald's fries is 350 kcal in Canada and 320 in the US, and
    // the menus differ outright.
    expect(fs.readFileSync("lib/seed/chain-foods.ts", "utf8")).toMatch(/Canadian figures/);
  });
});

suite("the lookup path knows the difference", () => {
  it("forks on perItem in both places that price food", () => {
    // lookup_food answers her directly; priceItems prices a whole plate for
    // log_meal. Two callers, one rule.
    expect(fs.readFileSync("lib/tools/foods.ts", "utf8")).toMatch(/if \(best\.perItem\)/);
    expect(fs.readFileSync("lib/tools/nutrition.ts", "utf8")).toMatch(/if \(best\.perItem\)/);
  });

  it("leaves an unpriceable item unpriced rather than guessing", () => {
    const src = fs.readFileSync("lib/tools/nutrition.ts", "utf8");
    expect(src).toMatch(/if \(n === null\) \{ unpriced\.push\(raw\); continue; \}/);
  });
});

suite("a unit may not itself contain a count", () => {
  it("has no row whose label is a number of pieces", () => {
    /*
      Caught on a live lookup: the nuggets were stored as boxes, so the unit
      was "6 piece" — and "6 mcnuggets" read as six boxes and answered 1500
      calories for a 250 calorie snack. Nobody orders "one six-piece"; they say
      a number of nuggets. Any row whose unit has a count in it has the same
      trap waiting.
    */
    for (const f of CHAIN_FOODS) {
      expect(f.unitLabel, `${f.slug}: "${f.unitLabel}" has a count in the unit`)
        .not.toMatch(/\d/);
    }
  });
});
