import { describe as suite, expect, it } from "vitest";
import {
  applyConsumption, applyRestock, compareStock, normaliseItem, stockLabel, summariseStock,
  type Stock,
} from "@/lib/pantry";

/**
 * The kitchen's whole job is knowing the difference between "you have none of
 * this" and "nobody has counted this". Every test here is a version of that.
 */

const stock = (item: string, amount: number | null, unit: string | null = null): Stock =>
  ({ item, amount, unit });
const need = (item: string, amount: number | null, unit: string | null = null) =>
  ({ item, amount, unit, fromMeals: 1 });

suite("normalising item names", () => {
  it("folds case, plurals and trailing punctuation", () => {
    expect(normaliseItem("Eggs")).toBe("egg");
    expect(normaliseItem("  chicken breast, ")).toBe("chicken breast");
    expect(normaliseItem("Rice")).toBe(normaliseItem("rice"));
  });
});

suite("comparing what is planned against what is in", () => {
  it("says have when there is enough", () => {
    const [line] = compareStock([need("chicken breast", 300, "g")], [stock("chicken breast", 500, "g")]);
    expect(line.status).toBe("have");
    expect(line.shortBy).toBeNull();
  });

  it("says short with the gap, not just a flag", () => {
    const [line] = compareStock([need("chicken breast", 500, "g")], [stock("chicken breast", 200, "g")]);
    expect(line.status).toBe("short");
    expect(line.shortBy).toBe(300);
  });

  it("treats zero as out, which is a thing we know", () => {
    const [line] = compareStock([need("egg", 4)], [stock("egg", 0)]);
    expect(line.status).toBe("out");
  });

  it("never reads an uncounted amount as enough", () => {
    const [line] = compareStock([need("rice", 200, "g")], [stock("rice", null, "g")]);
    expect(line.status).toBe("unknown");
    expect(line.shortBy).toBeNull();
  });

  it("never reads an uncounted *need* as covered either", () => {
    const [line] = compareStock([need("olive oil", null, null)], [stock("olive oil", 500, "ml")]);
    // Different measures: a question for her, not a number for us.
    expect(line.status).toBe("unknown");
  });

  it("reports a different measure as unknown rather than missing", () => {
    const [line] = compareStock([need("tomato", 2, "cans")], [stock("tomato", 400, "g")]);
    expect(line.status).toBe("unknown");
  });

  it("says missing only when there is no row at all", () => {
    const [line] = compareStock([need("paprika", 1, "tsp")], []);
    expect(line.status).toBe("missing");
  });

  it("counts what it does not know alongside what it does", () => {
    const lines = compareStock(
      [need("chicken breast", 300, "g"), need("rice", 200, "g"), need("paprika", 1, "tsp")],
      [stock("chicken breast", 500, "g"), stock("rice", null, "g")],
    );
    expect(summariseStock(lines)).toEqual({ need: 1, have: 1, unknownFor: 1 });
  });
});

suite("cooking takes food out of the kitchen", () => {
  it("subtracts a known amount", () => {
    const out = applyConsumption([stock("chicken breast", 500, "g")], ["300g chicken breast"]);
    expect(out).toEqual([{ item: "chicken breast", unit: "g", amount: 200, wasKnown: true }]);
  });

  it("never goes below zero", () => {
    const out = applyConsumption([stock("chicken breast", 100, "g")], ["300g chicken breast"]);
    expect(out[0].amount).toBe(0);
  });

  it("makes a known amount unknown when the recipe gives no quantity", () => {
    // She used some of it, so 500 is no longer true — and zero would be a lie
    // in the other direction. Unknown is what we now know.
    const out = applyConsumption([stock("olive oil", 500, "ml")], ["olive oil"]);
    expect(out[0].amount).toBeNull();
    expect(out[0].wasKnown).toBe(true);
  });

  it("does not invent a row for something she never had", () => {
    expect(applyConsumption([], ["300g chicken breast"])).toEqual([]);
  });

  it("takes each line off the running amount, not the original", () => {
    const out = applyConsumption([stock("egg", 12)], ["2 eggs", "3 eggs"]);
    expect(out[0].amount).toBe(7);
  });

  it("leaves an uncounted stock uncounted", () => {
    const out = applyConsumption([stock("rice", null, "g")], ["100g rice"]);
    expect(out[0].amount).toBeNull();
    expect(out[0].wasKnown).toBe(false);
  });
});

suite("groceries go back in", () => {
  it("adds to what is there", () => {
    expect(applyRestock([stock("chicken breast", 200, "g")], [
      { item: "Chicken breast", amount: 500, unit: "g" },
    ])).toEqual([{ item: "chicken breast", unit: "g", amount: 700 }]);
  });

  it("creates the row when it is new", () => {
    expect(applyRestock([], [{ item: "paprika", amount: 1, unit: "jar" }]))
      .toEqual([{ item: "paprika", unit: "jar", amount: 1 }]);
  });

  it("keeps an uncounted total uncounted", () => {
    expect(applyRestock([stock("rice", null, "g")], [{ item: "rice", amount: 500, unit: "g" }]))
      .toEqual([{ item: "rice", unit: "g", amount: null }]);
    expect(applyRestock([stock("rice", 500, "g")], [{ item: "rice", amount: null, unit: "g" }]))
      .toEqual([{ item: "rice", unit: "g", amount: null }]);
  });
});

suite("labels say which kind of number it is", () => {
  it("writes tight units the way a recipe does", () => {
    expect(stockLabel(400, "g")).toBe("400g");
    expect(stockLabel(2, "cans")).toBe("2 cans");
    expect(stockLabel(4, null)).toBe("4");
  });

  it("never renders an uncounted amount as a number", () => {
    expect(stockLabel(null, "g")).toBe("some");
    expect(stockLabel(0, "g")).toBe("out");
  });
});

suite("measures that do not line up", () => {
  it("marks the kitchen unknown when the recipe measured it differently", () => {
    // She cooked with the chicken. 500g is no longer true, and we cannot say
    // what two fillets weighed.
    const out = applyConsumption([stock("chicken breast", 500, "g")], ["2 fillets chicken breast"]);
    expect(out).toEqual([{ item: "chicken breast", unit: "g", amount: null, wasKnown: true }]);
  });

  it("leaves both rows alone when two of the same name could be meant", () => {
    const out = applyConsumption(
      [stock("tomato", 400, "g"), stock("tomato", 2, "cans")],
      ["tomatoes"],
    );
    expect(out).toEqual([]);
  });

  it("tops up the one row of that name when the receipt gives no measure", () => {
    expect(applyRestock([stock("olive oil", 500, "ml")], [{ item: "olive oil", amount: null, unit: null }]))
      .toEqual([{ item: "olive oil", unit: "ml", amount: null }]);
  });

  it("keeps a tin and a weight as separate lines", () => {
    expect(applyRestock([stock("tomato", 400, "g")], [{ item: "tomato", amount: 2, unit: "cans" }]))
      .toEqual([{ item: "tomato", unit: "cans", amount: 2 }]);
  });
});

suite("the name it shows back to her", () => {
  it("singularises properly, because this string is displayed", () => {
    // "tomatoe" reads as a typo in her kitchen list; in a lookup key nobody
    // would ever have seen it.
    expect(normaliseItem("tomatoes")).toBe("tomato");
    expect(normaliseItem("cherries")).toBe("cherry");
    expect(normaliseItem("chicken breasts")).toBe("chicken breast");
    expect(normaliseItem("boxes")).toBe("box");
  });

  it("leaves an s that was never a plural alone", () => {
    expect(normaliseItem("hummus")).toBe("hummus");
    expect(normaliseItem("watercress")).toBe("watercress");
  });

  it("folds the recipe line and the kitchen row to the same name", () => {
    const out = applyConsumption([stock("tomato", 6)], ["2 tomatoes"]);
    expect(out).toEqual([{ item: "tomato", unit: null, amount: 4, wasKnown: true }]);
  });
});
