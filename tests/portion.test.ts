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
    expect(parsePortion("3 chicken thighs")).toMatchObject({ amount: 3, unit: "unit", query: "chicken thighs" });
    expect(parsePortion("2 bananas")).toMatchObject({ amount: 2, unit: "unit", query: "bananas" });
  });

  it("recognises a named measure and keeps the food searchable", () => {
    expect(parsePortion("2 eggs")).toMatchObject({ amount: 2, unit: "named", namedUnit: "egg", query: "eggs" });
    expect(parsePortion("1 tin tuna")).toMatchObject({ amount: 1, unit: "named", namedUnit: "tin", query: "tuna" });
    expect(parsePortion("2 slices bread")).toMatchObject({ amount: 2, unit: "named", namedUnit: "slice", query: "bread" });
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
    const g = (s: string, unitGrams: number | null = null, unitLabel: string | null = null) =>
      toGrams(parsePortion(s)!, unitGrams, unitLabel);

    it("converts weights correctly", () => {
      expect(g("100g rice")).toBe(100);
      expect(g("1kg rice")).toBe(1000);
      expect(g("4oz salmon")).toBeCloseTo(113.4, 1);
      expect(g("1lb mince")).toBeCloseTo(453.6, 1);
    });

    it("uses the food's own natural unit", () => {
      expect(g("2 eggs", 50, "egg")).toBe(100);
      expect(g("3 slices", 40, "slice")).toBe(120);
      expect(g("1 tin tuna", 112, "tin (drained)")).toBe(112);
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
    expect(p.unit).toBe("named");
    expect(p.namedUnit).toBe("tbsp");
    expect(p.query).toBe("olive oil");
    expect(p.amount).toBe(1);
  });

  it("accepts the spelled-out forms", () => {
    expect(parsePortion("2 tablespoons peanut butter")!.namedUnit).toBe("tbsp");
    expect(parsePortion("1 teaspoon honey")!.namedUnit).toBe("tsp");
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

suite("named measures beyond spoons", () => {
  const g = (s: string, unitGrams: number | null, unitLabel: string | null) =>
    toGrams(parsePortion(s)!, unitGrams, unitLabel);

  it("resolves a measure the food is actually sold in", () => {
    expect(g("1 tin tuna", 112, "tin (drained)")).toBe(112);
    expect(g("2 tins tuna", 112, "tin (drained)")).toBe(224);
    expect(g("1 glass milk", 250, "glass (250ml)")).toBe(250);
    expect(g("1 handful almonds", 25, "handful")).toBe(25);
    expect(g("1 fillet salmon", 130, "fillet")).toBe(130);
    expect(g("2 rashers bacon", 25, "rasher")).toBe(50);
  });

  it("treats a serving as a portion, because they are the same word", () => {
    expect(g("1 serving rice", 180, "portion")).toBe(180);
    expect(g("2 portions rice", 180, "portion")).toBe(360);
  });

  // The reason every one of these is guarded. A glass of rice is not a thing,
  // and answering 180g for it would be a confident wrong calorie count.
  it("refuses a measure the food is not sold in", () => {
    expect(g("1 glass rice", 180, "portion")).toBeNull();
    expect(g("1 tin banana", 118, "banana")).toBeNull();
    expect(g("2 slices milk", 250, "glass (250ml)")).toBeNull();
  });

  it("still refuses when the food has no natural unit at all", () => {
    expect(g("1 tin mystery", null, null)).toBeNull();
  });
});

suite("the library's own spelling of a measure", () => {
  const g = (s: string, unitGrams: number | null, unitLabel: string | null) =>
    toGrams(parsePortion(s)!, unitGrams, unitLabel);

  // The library says "can (330ml)" where she says tin, and "portion" where she
  // says serving. Refusing on a spelling difference would send a measure that
  // is genuinely the food's own unit off to a model estimate.
  it("accepts the label's word for the same thing", () => {
    expect(g("1 tin cola", 330, "can (330ml)")).toBe(330);
    expect(g("1 can tuna", 112, "tin (drained)")).toBe(112);
    expect(g("1 serving rice", 180, "portion")).toBe(180);
    expect(g("1 portion yoghurt", 170, "serving")).toBe(170);
    expect(g("1 pot yoghurt", 170, "tub")).toBe(170);
  });

  it("does not let a synonym open the door to an unrelated measure", () => {
    expect(g("1 tin rice", 180, "portion")).toBeNull();
    expect(g("1 square milk", 250, "glass (250ml)")).toBeNull();
  });
});

suite("fluid ounces", () => {
  // Two words for one unit, and the one way an imperial kitchen measures milk.
  it("parses fl oz as a volume and weighs it like millilitres", () => {
    const p = parsePortion("8 fl oz milk")!;
    expect(p.unit).toBe("floz");
    expect(p.query).toBe("milk");
    expect(Math.round(toGrams(p, null, null)!)).toBe(237);
    expect(parsePortion("8fl oz milk")!.unit).toBe("floz");
    expect(parsePortion("8 fl. oz milk")!.unit).toBe("floz");
  });
  it("does not mistake plain ounces for fluid ones", () => {
    expect(parsePortion("4oz salmon")!.unit).toBe("oz");
  });
});
