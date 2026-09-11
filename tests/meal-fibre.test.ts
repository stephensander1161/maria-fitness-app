import { describe as suite, expect, it } from "vitest";
import { fibrePer100, formatFibre } from "@/lib/meal-fibre";
import { FOODS } from "@/lib/seed/foods";

suite("the fifth macro, recovered from the ingredients", () => {
  it("reads an empty fibre column as none for foods that have none", () => {
    // 172 seeded rows leave fibre_g empty and nearly all of them are animal
    // products, where the column was skipped rather than written 0.
    expect(fibrePer100({ fibreG: null, category: "meat" })).toBe(0);
    expect(fibrePer100({ fibreG: null, category: "dairy" })).toBe(0);
    expect(fibrePer100({ fibreG: null, category: "drink" })).toBe(0);
  });

  it("and as unmeasured for anything that could have some", () => {
    // A legume with no figure is a figure nobody has. Reading it as zero is
    // how a recipe quietly under-reports and looks like her failing a target.
    expect(fibrePer100({ fibreG: null, category: "legume" })).toBeNull();
    expect(fibrePer100({ fibreG: null, category: "vegetable" })).toBeNull();
    expect(fibrePer100({ fibreG: null, category: "grain" })).toBeNull();
    expect(fibrePer100({ fibreG: null, category: "sauce" })).toBeNull();
  });

  it("never invents a figure the row already carries", () => {
    expect(fibrePer100({ fibreG: 10.6, category: "grain" })).toBe(10.6);
    expect(fibrePer100({ fibreG: 0, category: "legume" })).toBe(0);
  });

  it("leaves few plant foods unmeasured, or the floor means nothing", () => {
    const plants = FOODS.filter(
      (f) => !["meat", "fish", "dairy", "eggs", "fat", "drink"].includes(f.category),
    );
    const unmeasured = plants.filter((f) => f.fibreG === null);
    expect(unmeasured.length / plants.length).toBeLessThan(0.1);
  });

  it("says a number is a floor when an ingredient did not resolve", () => {
    expect(formatFibre(12.4, 5, 5)).toBe("12g");
    expect(formatFibre(12.4, 3, 5)).toBe("≥12g");
  });

  it("and says nothing at all when none of them did", () => {
    // A dash on the card is honest; a 0 is a claim about the recipe.
    expect(formatFibre(0, 0, 4)).toBeNull();
    expect(formatFibre(null, null, 4)).toBeNull();
  });
});
