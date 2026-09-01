import { describe as suite, expect, it } from "vitest";
import { parsePortion, toGrams } from "@/lib/portion";

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
