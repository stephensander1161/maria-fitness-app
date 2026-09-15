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

  it("counts a named measure that is the item itself", () => {
    /*
      "3 slices of pizza" parses as a named measure, which for food sold by
      weight has to be converted and is refused when it cannot be. Here the
      measure *is* the item, and refusing a sentence it understood perfectly
      was the app being pedantic.
    */
    expect(itemCount(parsePortion("3 slices boston pizza pepperoni")!, null, "slice")).toBe(3);
    // …but only where it matches: a slice of something sold by the bottle is
    // still a question nobody can answer.
    expect(itemCount(parsePortion("3 slices of something")!, null, "bottle")).toBeNull();
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
    /*
      A number is fine where it is a *size* — "6 inch sub" is a length, and
      "2 subway turkey" means two subs, which is what anybody means. What is
      not fine is a count of the thing being named, because then the count in
      her sentence multiplies a unit that already has one in it.
    */
    const counted = /\d+\s*(piece|pc|pcs|count|ct|nugget|wing|strip|timbit|donut|tender)/i;
    for (const f of CHAIN_FOODS) {
      expect(f.unitLabel, `${f.slug}: "${f.unitLabel}" is a count of the thing itself`)
        .not.toMatch(counted);
    }
  });
});

suite("a panel that omits a figure leaves it null", () => {
  it("never fills a missing fibre in with something plausible", () => {
    /*
      Two Wendy's panels print no fibre at all. A burger is "about 2g" and
      that is exactly the guess this app must not write down: null makes the
      day's fibre a floor and say so, which is the truth. Every row that *does*
      carry a fibre figure got it off a panel.
    */
    const src = fs.readFileSync("lib/seed/chain-foods.ts", "utf8");
    expect(src).toMatch(/fibreG: null/);
    for (const f of CHAIN_FOODS) {
      if (f.fibreG === null) continue;
      expect(f.fibreG, f.slug).toBeGreaterThanOrEqual(0);
    }
  });

  it("says which menu a figure came from, on the row", () => {
    // A few chains publish one menu for both countries. `brand` is handed back
    // by lookup_food, so the provenance travels with the number.
    const menus = new Set(CHAIN_FOODS.map((f) => f.brand));
    expect([...menus].some((b) => b?.includes("US menu"))).toBe(true);
    expect([...menus].some((b) => b?.includes("Canada"))).toBe(true);
  });
});

suite("a restaurant row has to agree with itself", () => {
  /*
    The audit that does not need the internet.

    A chain's figures cannot be re-derived from anything — they are whatever
    the chain printed — so the only check available at build time is internal:
    protein, carbohydrate and fat at 4/4/9, plus fibre at 2, has to land near
    the stated calories. A row where those disagree is *definitely* wrong,
    whichever half of it is.

    It does not catch a row that is coherent and simply not the real product,
    and that is worth saying plainly: the Big Mac sat at 520 against a
    published 560 and reconciled perfectly all the way. This is a floor, not a
    guarantee, and the only real check is somebody reading the panel.

    Twelve per cent, because these are per-item rows rounded to the nearest
    whole gram by the chain itself: a 170-kcal taco whose macros are printed
    as 8/13/10 reconciles to 174 and nothing is wrong.
  */
  const ATWATER = { protein: 4, carbs: 4, fat: 9, fibre: 2 };
  const TOLERANCE = 0.12;

  for (const food of CHAIN_FOODS) {
    it(`${food.name} reconciles`, () => {
      // Unknown is not zero anywhere else in this app, and it is not here
      // either — but a restaurant panel prints all four, so a null is a row
      // somebody left half-filled and the check should still run on it.
      const from = (food.proteinG ?? 0) * ATWATER.protein
        + (food.carbsG ?? 0) * ATWATER.carbs
        + (food.fatG ?? 0) * ATWATER.fat
        + (food.fibreG ?? 0) * ATWATER.fibre;
      // Black coffee and the like: a handful of trace calories with no macros
      // to account for them is honest, not broken.
      if (food.kcal <= 15) return;
      const off = Math.abs(food.kcal - from) / food.kcal;
      expect(off, `${food.name}: states ${food.kcal}, macros give ${Math.round(from)}`)
        .toBeLessThan(TOLERANCE);
    });
  }
});

suite("the Timbit is a range, not a number", () => {
  /*
    It was one row at 80 kcal, and it was wrong for almost everybody: Honey
    Dip is 50 and Sour Cream Glazed is 90. The chat quoted 120, which was the
    model estimating rather than reading the library at all — but the library
    it would have read was overstating the light ones by sixty per cent.
  */
  const timbits = CHAIN_FOODS.filter((f) => f.slug.startsWith("tims-timbit"));

  it("carries the flavours, because they are nearly double each other", () => {
    expect(timbits.length).toBeGreaterThanOrEqual(4);
    const kcal = timbits.map((t) => t.kcal);
    expect(Math.min(...kcal)).toBe(50);
    expect(Math.max(...kcal)).toBe(90);
  });

  it("sends a bare 'timbit' to the assorted row, and says so in the name", () => {
    const generic = timbits.find((t) => t.aliases.includes("timbit"));
    expect(generic?.slug).toBe("tims-timbit-assorted");
    // Named for what it is, so the coach quotes it as a range rather than as
    // a fact about the one she ate.
    expect(generic?.name).toMatch(/assorted/i);
    expect(generic?.name).toMatch(/50/);
  });

  it("guesses the middle rather than the low end", () => {
    /*
      Not the cheapest number. An under-counted day is an invented deficit —
      the failure this whole file is careful about — so where the app has to
      guess between 50 and 90 it guesses 70, never 50.
    */
    const generic = timbits.find((t) => t.slug === "tims-timbit-assorted")!;
    const others = timbits.filter((t) => t !== generic).map((t) => t.kcal);
    expect(generic.kcal).toBeGreaterThan(Math.min(...others));
    expect(generic.kcal).toBeLessThan(Math.max(...others));
  });
});

suite("a corrected row does not leave the old one answering", () => {
  /*
    The seed upserted and never deleted, and a ghost in this table is not
    inert — it keeps its aliases. Three were found the day this was written:
    the single Timbit row that the flavours replaced, and both McNugget *box*
    rows that the per-nugget row replaced when "6 mcnuggets" was returning
    1500 kcal. That fix had shipped; the boxes were still there answering to
    "mcnuggets" the whole time.

    So the seed retires what it no longer knows — and only its own rows. The
    model's cached estimates are the other half of this table, and a figure
    she has already logged a meal against must not vanish underneath her.
  */
  const run = fs.readFileSync("lib/seed/run.ts", "utf8");

  it("deletes seeded rows the seed has dropped", () => {
    expect(run).toMatch(/notInArray\(foods\.slug, seeded\)/);
  });

  it("never touches the model's cached guesses", () => {
    expect(run).toMatch(/eq\(foods\.estimated, false\)/);
    const clause = run.slice(run.indexOf("db.delete(foods)"), run.indexOf("returning({ slug"));
    expect(clause).toMatch(/and\(/);
  });

  it("says what it retired, rather than doing it quietly", () => {
    // A silent delete in a seed script is how you find out months later.
    expect(run).toMatch(/retired/);
  });

  it("gives every slug to exactly one row", () => {
    const slugs = CHAIN_FOODS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every alias to exactly one row", () => {
    // Two rows claiming "timbit" is the ghost problem in its other form: the
    // lookup picks one and nobody can say which.
    const seen = new Map<string, string>();
    for (const f of CHAIN_FOODS) {
      for (const alias of f.aliases) {
        const already = seen.get(alias);
        expect(already, `"${alias}" is claimed by ${already} and ${f.slug}`).toBeUndefined();
        seen.set(alias, f.slug);
      }
    }
  });
});
