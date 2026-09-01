import { describe as suite, expect, it } from "vitest";
import { matchScore, parsePortion, toGrams } from "@/lib/portion";

suite("reading a portion", () => {
  it("handles the shapes people actually type", () => {
    expect(parsePortion("100g boiled egg")).toMatchObject({ amount: 100, unit: "g", query: "boiled egg" });
    expect(parsePortion("100 g chicken breast")).toMatchObject({ amount: 100, unit: "g", query: "chicken breast" });
    expect(parsePortion("4oz salmon")).toMatchObject({ amount: 4, unit: "oz", query: "salmon" });
    expect(parsePortion("1.5 lb mince")).toMatchObject({ amount: 1.5, unit: "lb", query: "mince" });
    expect(parsePortion("200ml milk")).toMatchObject({ amount: 200, unit: "ml", query: "milk" });
  });

  it("treats a bare number as natural units", () => {
    expect(parsePortion("2 eggs")).toMatchObject({ amount: 2, unit: "unit", query: "eggs" });
    expect(parsePortion("3 chicken thighs")).toMatchObject({ amount: 3, unit: "unit", query: "chicken thighs" });
  });

  it("assumes 100g when no amount is given, and says so", () => {
    expect(parsePortion("chicken breast")).toMatchObject({
      amount: 100, unit: "g", query: "chicken breast", assumed: true,
    });
  });

  it("strips filler words that would break a lookup", () => {
    expect(parsePortion("100g of chicken")?.query).toBe("chicken");
    expect(parsePortion("2 slices of bread")?.query).toBe("bread");
  });

  it("refuses nonsense rather than guessing", () => {
    expect(parsePortion("")).toBeNull();
    expect(parsePortion("   ")).toBeNull();
  });

  it("falls back to 100g on a zero or negative amount", () => {
    expect(parsePortion("0 chicken")).toMatchObject({ assumed: true, amount: 100 });
  });

  suite("converting to grams", () => {
    const g = (s: string, unitGrams: number | null = null) =>
      toGrams(parsePortion(s)!, unitGrams);

    it("converts weights correctly", () => {
      expect(g("100g rice")).toBe(100);
      expect(g("1kg rice")).toBe(1000);
      expect(g("4oz salmon")).toBeCloseTo(113.4, 1);
      expect(g("1lb mince")).toBeCloseTo(453.6, 1);
    });

    it("uses the food's own natural unit", () => {
      expect(g("2 eggs", 50)).toBe(100);
      expect(g("3 slices", 40)).toBe(120);
    });

    it("returns null rather than inventing a weight for an unknown unit", () => {
      // "2 broccoli" means nothing without a per-item weight, and guessing one
      // would produce a confident wrong calorie count.
      expect(g("2 broccoli", null)).toBeNull();
    });
  });
});

suite("spoon measures", () => {
  it("keeps the food searchable when a spoon is given", () => {
    const p = parsePortion("1 tbsp olive oil")!;
    expect(p.unit).toBe("tbsp");
    expect(p.query).toBe("olive oil");
    expect(p.amount).toBe(1);
  });

  it("accepts the spelled-out forms", () => {
    expect(parsePortion("2 tablespoons peanut butter")!.unit).toBe("tbsp");
    expect(parsePortion("1 teaspoon honey")!.unit).toBe("tsp");
  });

  it("resolves a spoon against a food measured in that spoon", () => {
    expect(toGrams(parsePortion("1 tbsp olive oil")!, 14, "tbsp")).toBe(14);
    expect(toGrams(parsePortion("2 tbsp olive oil")!, 14, "tbsp")).toBe(28);
    expect(toGrams(parsePortion("1 tsp sugar")!, 4, "tsp")).toBe(4);
  });

  // The point of the guard: a tablespoon of oil and one of honey differ by half
  // again in weight, so a food's "portion" or "slice" tells us nothing about
  // what a spoon of it weighs. Refusing sends it to the estimate instead of
  // publishing a confident wrong number.
  it("refuses a spoon when the food is not measured in spoons", () => {
    expect(toGrams(parsePortion("1 tbsp rice")!, 180, "portion")).toBeNull();
    expect(toGrams(parsePortion("1 tbsp bread")!, 40, "slice")).toBeNull();
    expect(toGrams(parsePortion("1 tbsp mystery")!, null, null)).toBeNull();
  });
});

suite("ranking a food match", () => {
  it("prefers an exact name", () => {
    expect(matchScore("banana", "Banana", [])).toBeLessThan(
      matchScore("banana", "Banana bread", []),
    );
  });

  // The bug this was written for: "rice" is an exact alias of the staple, but
  // scoring the name alone ranked it below a snack whose name merely starts
  // with the word.
  it("lets an exact alias beat an unrelated name prefix", () => {
    const staple = matchScore("rice", "White rice, cooked", ["rice", "boiled rice"]);
    const snack = matchScore("rice", "Rice cakes", ["puffed rice cake"]);
    expect(staple).toBeLessThan(snack);
  });

  it("still ranks the food actually called that above an alias match", () => {
    expect(matchScore("rice cakes", "Rice cakes", [])).toBeLessThan(
      matchScore("rice cakes", "Something else", ["rice cakes"]),
    );
  });

  it("scores a food that matches nothing worst", () => {
    expect(matchScore("rice", "Olive oil", ["evoo"])).toBe(3);
  });
});
