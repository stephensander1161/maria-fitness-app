import { describe as suite, expect, it } from "vitest";
import { groupForFood, guessCategory, sortKitchen, stateFor, type KitchenItem } from "@/lib/kitchen";

const tile = (item: string, state: KitchenItem["state"]): KitchenItem => ({
  item, state, category: null, label: "", needed: null, extra: false, unit: null,
});

suite("the kitchen is a set of things with states", () => {
  it("keeps 'unknown' as its own state rather than rounding it", () => {
    // Grams against tins cannot be compared, and lib/pantry.ts says so on
    // purpose. Calling it "have" invents a surplus; calling it "need" sends
    // her to buy something she already has.
    expect(stateFor({ amount: null }, "unknown")).toBe("unknown");
    expect(stateFor({ amount: 400 }, "unknown")).toBe("unknown");
  });

  it("separates out from missing, because they are different facts", () => {
    // Zero is "we have run out", which is why it belongs on the list. No row
    // at all is "never bought", which is a different thing to tell her.
    expect(stateFor({ amount: 0 }, null)).toBe("out");
    expect(stateFor(null, "missing")).toBe("need");
  });

  it("counts an uncounted amount as being in the kitchen", () => {
    // "Some, nobody counted it" is not none.
    expect(stateFor({ amount: null }, "have")).toBe("in");
  });

  it("puts what she has to act on first", () => {
    const sorted = sortKitchen([
      tile("rice", "in"),
      tile("chicken", "need"),
      tile("oats", "out"),
      tile("passata", "unknown"),
    ]);
    expect(sorted.map((t) => t.item)).toEqual(["chicken", "oats", "passata", "rice"]);
  });

  it("files every seeded food category under a group", () => {
    // A category with no group lands in "other", which is honest but means a
    // whole aisle of the library hiding behind one chip.
    const seeded = [
      "vegetable", "fruit", "meat", "fish", "eggs", "legume",
      "dairy", "grain", "sauce", "fat", "nut", "snack", "drink", "prepared",
    ];
    const homeless = seeded.filter((c) => groupForFood(c) === "other");
    expect(homeless, `these have no chip of their own: ${homeless.join(", ")}`).toEqual([]);
    expect(groupForFood(null)).toBe("other");
  });
});


suite("a real kitchen is written in plurals and staples", () => {
  it("files the things a nutrition library does not carry", () => {
    // These are all real lines from a real pantry. The food table is
    // nutrition data — it has chicken breast and cheddar, not cumin or a
    // crusty bread roll — and without a fallback two fifths of the kitchen
    // sat under one unusable "Other" chip.
    const staples: [string, string][] = [
      ["cumin", "sauce"],
      ["chili powder", "sauce"],
      ["chicken stock", "sauce"],
      ["crusty bread roll", "grain"],
      ["wholemeal bread", "grain"],
      ["olive oil", "fat"],
      ["parsley", "vegetable"],
      ["seaweed snacks", "snack"],
    ];
    for (const [item, expected] of staples) {
      expect(guessCategory(item), item).toBe(expected);
    }
  });

  it("reads plurals, because that is how a kitchen is written down", () => {
    // "Bell peppers sliced" and "diced potatoes" both missed a list that
    // only knew the singular.
    expect(guessCategory("bell peppers sliced")).toBe("vegetable");
    expect(guessCategory("diced potatoes")).toBe("vegetable");
    expect(guessCategory("mixed berries")).toBe("fruit");
    expect(guessCategory("cooked penne")).toBe("grain");
  });

  it("guesses nothing rather than guessing wrong", () => {
    // It picks a glyph and a chip and is never allowed near a number.
    // Something genuinely unrecognisable gets no category at all.
    expect(guessCategory("zzzqx")).toBeNull();
  });
});
