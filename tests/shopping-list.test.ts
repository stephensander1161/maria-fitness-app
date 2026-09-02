import { describe as suite, expect, it } from "vitest";
import { aisleForItem } from "@/lib/shopping-list";

/**
 * Which aisle a shopping item lands in.
 *
 * A hundred lines that had never been tested, and they carry a bug this app
 * has already shipped once: garlic filed as a frozen ready meal, because
 * "garlic bread" is a longer label than "garlic" and the ranking preferred
 * longer labels in both directions.
 */
const library = [
  { name: "Garlic", category: "vegetable", aliases: [] },
  { name: "Garlic bread", category: "prepared", aliases: [] },
  { name: "Chicken breast, raw", category: "meat", aliases: ["chicken breast"] },
  { name: "Chicken", category: "meat", aliases: [] },
  { name: "Milk, semi-skimmed", category: "dairy", aliases: ["milk"] },
  { name: "Oats", category: "grain", aliases: ["porridge oats", "rolled oats"] },
  { name: "Protein shake", category: "drink", aliases: [] },
];

suite("filing an item by its aisle", () => {
  it("matches an exact name first", () => {
    expect(aisleForItem("garlic", library)).toBe("Fruit & veg");
    expect(aisleForItem("Garlic", library)).toBe("Fruit & veg");
  });

  it("does not let a longer label swallow a shorter item", () => {
    // The shipped bug: "garlic" is contained *by* "garlic bread", and
    // preferring the longer match put a bulb of garlic in with ready meals.
    expect(aisleForItem("garlic", library)).not.toBe("Chilled & frozen");
  });

  it("prefers the most specific label when the item contains it", () => {
    // Here longer *is* better: "chicken breast" beats "chicken".
    expect(aisleForItem("chicken breast", library)).toBe("Meat & fish");
    expect(aisleForItem("2 chicken breasts", library)).toBe("Meat & fish");
  });

  it("matches aliases as readily as names", () => {
    expect(aisleForItem("porridge oats", library)).toBe("Cupboard");
    expect(aisleForItem("milk", library)).toBe("Dairy & eggs");
  });

  it("falls back to Other rather than guessing", () => {
    // A wrong aisle sends her to the wrong end of the shop; "Other" sends her
    // to the bottom of the list, which is honest.
    expect(aisleForItem("cling film", library)).toBe("Other");
    expect(aisleForItem("", library)).toBe("Other");
  });

  it("is not confused by quantities left on the line", () => {
    expect(aisleForItem("garlic cloves", library)).toBe("Fruit & veg");
  });
});
