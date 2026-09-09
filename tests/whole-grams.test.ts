import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { z } from "zod";
import { wholeGrams, wholeGramsNullable, wholeGramsOptional } from "@/lib/whole-grams";
import { registry } from "@/lib/tools";
import { mealDraft } from "@/lib/agent/planner";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("a macro on its way into an integer column", () => {
  it("is rounded to a whole gram", () => {
    // "4.5 oz chicken, half a cup of quinoa and 76g of green beans" came back
    // as 45.3g of protein and 22.6g of carbohydrate, Postgres refused the
    // insert, and the coach told him there was a database issue.
    expect(wholeGrams.parse(45.3)).toBe(45);
    expect(wholeGrams.parse(22.6)).toBe(23);
    expect(wholeGrams.parse(0.4)).toBe(0);
    expect(wholeGrams.parse(12)).toBe(12);
  });

  it("keeps missing and unknown apart from zero", () => {
    // Rounding must not turn "she did not say" into a number.
    expect(wholeGramsOptional.parse(undefined)).toBeUndefined();
    expect(wholeGramsNullable.parse(null)).toBeNull();
    expect(wholeGramsNullable.parse(undefined)).toBeUndefined();
    expect(wholeGramsNullable.parse(3.7)).toBe(4);
  });

  it("leaves the key optional, so a caller may still omit it", () => {
    // `.optional().transform()` rounds a possibly-undefined value and makes
    // the key required in the inferred type, which breaks every caller that
    // legitimately leaves it out.
    const shape = z.object({ a: wholeGramsOptional, b: z.string() });
    expect(shape.parse({ b: "x" })).toEqual({ b: "x" });
  });
});

suite("every model-fed macro goes through it", () => {
  it("log_meal rounds what the coach hands it", () => {
    const tool = registry.get("log_meal")!;
    const parsed = tool.input.parse({
      slot: "dinner",
      description: "4.5 oz chicken breast, 1/2 cup quinoa, 76g green beans",
      calories: 345, proteinG: 45.3, carbsG: 22.6, fatG: 6.6, fibreG: 3.7,
    }) as Record<string, unknown>;
    expect(parsed.proteinG).toBe(45);
    expect(parsed.carbsG).toBe(23);
    expect(parsed.fatG).toBe(7);
    expect(parsed.fibreG).toBe(4);
  });

  it("and so does the week the planner writes", () => {
    const out = mealDraft.parse({
      calorieTarget: 2600.4, proteinTargetG: 150.7,
      meals: [{ dayOfWeek: 0, slot: "dinner", title: "Chicken and rice", calories: 612.3, proteinG: 45.3 }],
    });
    expect(out.calorieTarget).toBe(2600);
    expect(out.proteinTargetG).toBe(151);
    expect(out.meals[0].calories).toBe(612);
    expect(out.meals[0].proteinG).toBe(45);
  });

  it("no macro field is left declaring a bare number", () => {
    // The point of a shared schema is that the next one cannot be forgotten.
    const fields = /(calorieTarget|proteinTargetG|carbTargetG|fatTargetG|calories|proteinG|carbsG|fatG|fibreG|caloriesLow|caloriesHigh): z\.number\(\)/;
    for (const f of [
      "lib/tools/nutrition.ts", "lib/tools/corrections.ts",
      "lib/tools/check-in.ts", "lib/agent/planner.ts",
    ]) {
      expect(read(f).match(fields)?.[0] ?? null, f).toBeNull();
    }
  });
});
