import { describe, expect, it } from "vitest";
import { toLineItems } from "@/lib/instacart";
import { aggregateIngredients, shoppingListText } from "@/lib/shopping";

describe("Instacart line items", () => {
  it("passes weights and volumes through in units Instacart accepts", () => {
    const items = aggregateIngredients(["500g chicken breast", "1.5 kg potatoes", "200ml milk", "1 l stock"]);
    expect(toLineItems(items)).toEqual(
      expect.arrayContaining([
        { name: "chicken breast", quantity: 500, unit: "g" },
        { name: "potatoes", quantity: 1.5, unit: "kg" },
        { name: "milk", quantity: 200, unit: "ml" },
        { name: "stock", quantity: 1, unit: "l" },
      ]),
    );
  });

  it("spells out spoon and cup measures the way the API wants them", () => {
    const items = aggregateIngredients(["2 tbsp olive oil", "1 tsp cumin", "1/2 cup rice", "2 lbs beef mince"]);
    expect(toLineItems(items)).toEqual(
      expect.arrayContaining([
        { name: "olive oil", quantity: 2, unit: "tablespoon" },
        { name: "cumin", quantity: 1, unit: "teaspoon" },
        { name: "rice", quantity: 0.5, unit: "cup" },
        { name: "beef mince", quantity: 2, unit: "lb" },
      ]),
    );
  });

  it("sends bare counts as each and lines with no quantity as one", () => {
    const items = aggregateIngredients(["4 eggs", "2 eggs", "cherry tomatoes"]);
    expect(toLineItems(items)).toEqual(
      expect.arrayContaining([
        { name: "eggs", quantity: 6, unit: "each" },
        { name: "cherry tomatoes", quantity: 1, unit: "each" },
      ]),
    );
  });

  it("keeps the original wording when the unit has no Instacart equivalent", () => {
    const items = aggregateIngredients(["4 cloves garlic", "2 fillets salmon", "1 handful spinach"]);
    const lines = toLineItems(items);
    expect(lines.find((l) => l.name === "garlic")).toEqual({
      name: "garlic", quantity: 1, unit: "each", display_text: "4 cloves garlic",
    });
    expect(lines.find((l) => l.name === "salmon")?.display_text).toBe("2 fillets salmon");
    // Nothing is silently dropped for having an odd unit.
    expect(lines).toHaveLength(3);
  });

  it("maps tins and packs onto can and package", () => {
    const items = aggregateIngredients(["2 tins chopped tomatoes", "1 pack tortillas", "1 bunch coriander"]);
    expect(toLineItems(items)).toEqual(
      expect.arrayContaining([
        { name: "chopped tomatoes", quantity: 2, unit: "can" },
        { name: "tortillas", quantity: 1, unit: "package" },
        { name: "coriander", quantity: 1, unit: "bunch" },
      ]),
    );
  });
});

describe("shopping list as text", () => {
  it("groups by aisle with the quantity in front of the item", () => {
    const text = shoppingListText("Shopping list — week of Mon, Sep 1", [
      { aisle: "Fruit & veg", items: [{ item: "onions", quantity: "2" }, { item: "spinach", quantity: null }] },
      { aisle: "Meat & fish", items: [{ item: "chicken breast", quantity: "1.1 lb" }] },
    ]);
    expect(text).toBe(
      "Shopping list — week of Mon, Sep 1\n\n" +
      "FRUIT & VEG\n• 2 onions\n• spinach\n\n" +
      "MEAT & FISH\n• 1.1 lb chicken breast",
    );
  });
});
