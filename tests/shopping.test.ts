import { describe as suite, expect, it } from "vitest";
import { aggregateIngredients, formatAmount, parseIngredientLine } from "@/lib/shopping";

suite("reading an ingredient line", () => {
  it("splits a quantity stuck to its unit", () => {
    expect(parseIngredientLine("120g cottage cheese")).toEqual({ amount: 120, unit: "g", item: "cottage cheese" });
    expect(parseIngredientLine("150ml milk")).toEqual({ amount: 150, unit: "ml", item: "milk" });
  });

  it("splits a quantity from a unit written as a word", () => {
    expect(parseIngredientLine("2 slices rye bread")).toEqual({ amount: 2, unit: "slices", item: "rye bread" });
    expect(parseIngredientLine("1 tbsp pesto")).toEqual({ amount: 1, unit: "tbsp", item: "pesto" });
  });

  // "eggs" is the food, not a unit. Treating it as one would leave the item
  // blank and the list would say "4" with nothing to buy.
  it("keeps the food when it follows a bare count", () => {
    expect(parseIngredientLine("4 eggs")).toEqual({ amount: 4, unit: null, item: "eggs" });
    expect(parseIngredientLine("1 banana")).toEqual({ amount: 1, unit: null, item: "banana" });
  });

  // The 10% of the week's lines that used to parse as nonsense.
  it("reads fractions", () => {
    expect(parseIngredientLine("1/2 cup bell pepper")).toEqual({ amount: 0.5, unit: "cup", item: "bell pepper" });
    expect(parseIngredientLine("1 1/2 cups spinach")).toEqual({ amount: 1.5, unit: "cups", item: "spinach" });
    expect(parseIngredientLine("½ avocado")).toEqual({ amount: 0.5, unit: null, item: "avocado" });
    expect(parseIngredientLine("1½ tbsp olive oil")).toEqual({ amount: 1.5, unit: "tbsp", item: "olive oil" });
  });

  // She knows how many tomatoes she wants. Inventing a number is worse than
  // handing her the line as written.
  it("leaves an unquantified line alone rather than guessing", () => {
    expect(parseIngredientLine("cherry tomatoes")).toEqual({ amount: null, unit: null, item: "cherry tomatoes" });
    expect(parseIngredientLine("salt and pepper")).toEqual({ amount: null, unit: null, item: "salt and pepper" });
    expect(parseIngredientLine("splash of milk")).toEqual({ amount: null, unit: null, item: "splash of milk" });
  });

  it("drops the words in front of the food that are not its name", () => {
    expect(parseIngredientLine("1 large onion").item).toBe("onion");
    expect(parseIngredientLine("2 of the eggs").item).toBe("eggs");
  });
});

suite("building the list", () => {
  it("adds like with like", () => {
    const list = aggregateIngredients(["120g cottage cheese", "150g cottage cheese", "4 eggs", "2 eggs"]);
    expect(list.find((i) => i.item === "cottage cheese")).toMatchObject({ amount: 270, unit: "g", fromMeals: 2 });
    expect(list.find((i) => i.item === "eggs")).toMatchObject({ amount: 6, unit: null, fromMeals: 2 });
  });

  // The rule that stops the list being wrong: 100g of spinach and a handful of
  // spinach are not five handfuls of anything.
  it("refuses to add across different units", () => {
    const list = aggregateIngredients(["100g spinach", "1 handful spinach"]);
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.unit).sort()).toEqual(["g", "handful"]);
  });

  it("combines the same thing however it was written", () => {
    const list = aggregateIngredients(["2 Eggs", "3 eggs", "1 egg"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amount: 6, fromMeals: 3 });
  });

  it("keeps a number when the same food also appears without one", () => {
    const list = aggregateIngredients(["200g yoghurt", "yoghurt"]);
    const y = list.find((i) => i.item.toLowerCase().includes("yoghurt"));
    expect(y?.amount).toBe(200);
  });

  it("counts how many meals want each thing", () => {
    const list = aggregateIngredients(["1 tbsp olive oil", "1 tbsp olive oil", "1 tbsp olive oil"]);
    expect(list[0]).toMatchObject({ amount: 3, fromMeals: 3 });
  });

  it("adds fractions without floating-point litter", () => {
    const list = aggregateIngredients(["1/2 cup spinach", "1/2 cup spinach"]);
    expect(formatAmount(list[0].amount!)).toBe("1");
    expect(formatAmount(1 / 3 + 1 / 3)).toBe("0.67");
  });

  it("copes with an empty week", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });
});
