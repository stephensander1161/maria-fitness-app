import { describe as suite, expect, it } from "vitest";
import { normaliseQuantity } from "@/lib/quantities";
import { parsePortion } from "@/lib/portion";

/*
  "i see i add 2x so it needs to be smart enough to know the difference between
   pork chop and if i write '2x pork chops' for example and other quantity
   nomenclature too."

  He was right that it mattered and wrong about which one was broken: "2x" was
  the one form the parser already understood. Everything else people type was
  read as a hundred grams of a food with a number in its name — and a portion
  this gets wrong is never reported as an error, it is reported as a number.
*/

/** The amount and the search term, which is all the lookup uses. */
const parsed = (q: string) => {
  const p = parsePortion(q);
  return p && `${p.amount} ${p.query}`;
};

suite("the ways people write a count", () => {
  it("reads a number written out", () => {
    expect(normaliseQuantity("two pork chops")).toBe("2 pork chops");
    expect(normaliseQuantity("three chicken thighs")).toBe("3 chicken thighs");
    expect(normaliseQuantity("twelve almonds")).toBe("12 almonds");
  });

  it("reads the count written after the food", () => {
    // How a receipt writes it, and about half the people typing a meal.
    expect(normaliseQuantity("pork chops x2")).toBe("2 pork chops");
    expect(normaliseQuantity("pork chops (x2)")).toBe("2 pork chops");
    expect(normaliseQuantity("timbits x6")).toBe("6 timbits");
  });

  it("reads the multiplication sign a phone keyboard gives you", () => {
    expect(parsed("2 × steak")).toBe("2 steak");
    expect(parsed("2x pork chops")).toBe("2 pork chops");
  });

  it("reads a vague count as the number it means", () => {
    expect(normaliseQuantity("a couple of eggs")).toBe("2 eggs");
    expect(normaliseQuantity("a few almonds")).toBe("3 almonds");
    expect(normaliseQuantity("a dozen eggs")).toBe("12 eggs");
    expect(normaliseQuantity("half a chicken breast")).toBe("0.5 chicken breast");
  });

  it("reads a fraction, typed or tapped", () => {
    expect(normaliseQuantity("½ cup rice")).toBe("0.5 cup rice");
    expect(normaliseQuantity("1/2 cup rice")).toBe("0.5 cup rice");
    expect(normaliseQuantity("1 1/2 cups rice")).toBe("1.5 cups rice");
    expect(normaliseQuantity("¾ cup oats")).toBe("0.75 cup oats");
  });

  it("takes the middle of a range rather than picking a side", () => {
    // Two or three eggs is two and a half eggs. Rounding to either end is a
    // decision about whether to flatter her, and this app does not make it.
    expect(normaliseQuantity("2-3 eggs")).toBe("2.5 eggs");
    expect(normaliseQuantity("2 to 3 eggs")).toBe("2.5 eggs");
  });

  it("leaves a food that merely contains a number alone", () => {
    // The whole risk of this file is reading a name as a count.
    expect(normaliseQuantity("7-up")).toBe("7-up");
    expect(normaliseQuantity("chicken")).toBe("chicken");
    expect(normaliseQuantity("100g chicken")).toBe("100g chicken");
    // A hyphen is only a range between two numbers at the start.
    expect(normaliseQuantity("chicken-and-rice")).toBe("chicken-and-rice");
  });

  it("does not turn a two-part meal into a portion of one thing", () => {
    /*
      "chicken and a couple of eggs" is a plate with two components, and the
      estimator is what handles those. Reading it as "2 chicken and eggs"
      would be worse than leaving it exactly as typed.
    */
    expect(normaliseQuantity("chicken and a couple of eggs"))
      .toBe("chicken and a couple of eggs");
  });

  it("carries through to what the lookup actually asks for", () => {
    // The point of all of it: the amount reaches the portion, and the food
    // reaches the search without the count stuck to it.
    expect(parsed("two pork chops")).toBe("2 pork chops");
    expect(parsed("pork chops x2")).toBe("2 pork chops");
    expect(parsed("a dozen eggs")).toBe("12 eggs");
    // A cup is a measure the library almost never carries, so this resolves
    // to a refusal and an estimate rather than to a confident wrong number —
    // but it resolves to *half a cup of rice*, which it did not before.
    expect(parsePortion("½ cup rice")).toMatchObject({
      amount: 0.5, unit: "named", namedUnit: "cup", query: "rice",
    });
  });
});
