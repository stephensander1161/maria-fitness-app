import { describe as suite, expect, it } from "vitest";
import { FOODS, type FoodSeed } from "@/lib/seed/foods";
import { MEAL_TEMPLATES } from "@/lib/seed/meal-templates";

/**
 * The food library is reference data she is shown as fact: the calculator
 * prints its numbers with no hedge, and the coach quotes them back to her.
 * Nothing checks a seed file at runtime, so these are the checks — a wrong
 * row here is a wrong calorie count presented with total confidence.
 *
 * The macro reconciliation is the load-bearing one. Everything else catches
 * typos; that one catches a value copied from the wrong column.
 */

const CATEGORIES = [
  "meat", "fish", "dairy", "eggs", "grain", "legume", "vegetable",
  "fruit", "nut", "fat", "sauce", "drink", "snack", "prepared",
] as const;

suite("food library shape", () => {
  it("has a substantial library", () => {
    expect(FOODS.length).toBeGreaterThan(300);
  });

  it("gives every food a unique slug", () => {
    const seen = new Map<string, string>();
    for (const f of FOODS) {
      expect(seen.has(f.slug), `duplicate slug "${f.slug}"`).toBe(false);
      seen.set(f.slug, f.name);
    }
  });

  it("gives every food a unique name", () => {
    const seen = new Set<string>();
    for (const f of FOODS) {
      const key = f.name.toLowerCase();
      expect(seen.has(key), `duplicate name "${f.name}"`).toBe(false);
      seen.add(key);
    }
  });

  it("uses only known categories", () => {
    for (const f of FOODS) {
      expect(CATEGORIES, `${f.slug} has category "${f.category}"`).toContain(f.category);
    }
  });

  // An alias that is another food's actual name makes the lookup ambiguous in
  // a way ranking cannot resolve: "rice" could mean the staple or the snack.
  it("never aliases a food to another food's name", () => {
    const names = new Map(FOODS.map((f) => [f.name.toLowerCase(), f.slug]));
    for (const f of FOODS) {
      for (const alias of f.aliases) {
        const owner = names.get(alias.trim().toLowerCase());
        expect(
          owner === undefined || owner === f.slug,
          `${f.slug} claims alias "${alias}", which is ${owner}'s name`,
        ).toBe(true);
      }
    }
  });

  it("never gives two foods the same alias", () => {
    const claimed = new Map<string, string>();
    for (const f of FOODS) {
      for (const alias of f.aliases) {
        const key = alias.trim().toLowerCase();
        const prior = claimed.get(key);
        expect(prior === undefined, `"${alias}" claimed by both ${prior} and ${f.slug}`).toBe(true);
        claimed.set(key, f.slug);
      }
    }
  });

  // toGrams multiplies by unitGrams and prints unitLabel. One without the
  // other is either a weight with no name or a name with no weight.
  it("sets unitGrams and unitLabel together or not at all", () => {
    for (const f of FOODS) {
      expect(
        (f.unitGrams === null) === (f.unitLabel === null),
        `${f.slug} has unitGrams ${f.unitGrams} and unitLabel ${f.unitLabel}`,
      ).toBe(true);
      if (f.unitGrams !== null) expect(f.unitGrams, f.slug).toBeGreaterThan(0);
    }
  });

  it("has no negative or absurd values", () => {
    for (const f of FOODS) {
      for (const [k, v] of [
        ["kcal", f.kcal], ["proteinG", f.proteinG],
        ["carbsG", f.carbsG], ["fatG", f.fatG], ["fibreG", f.fibreG ?? 0],
      ] as const) {
        expect(v, `${f.slug}.${k}`).toBeGreaterThanOrEqual(0);
      }
      // Per 100g, nothing can exceed 100g of anything, and pure fat is the
      // calorie ceiling at 900.
      expect(f.proteinG + f.carbsG + f.fatG + (f.fibreG ?? 0), f.slug).toBeLessThanOrEqual(100);
      expect(f.kcal, f.slug).toBeLessThanOrEqual(900);
    }
  });
});

/**
 * Alcohol carries 7 kcal/g and has no column in the schema, so 4/4/9 is
 * structurally wrong for these — not a data error, a modelling limit.
 */
const ALCOHOL = new Set([
  "lager", "ale", "stout", "cider", "wine-red", "wine-white", "prosecco", "spirits-40",
]);

/**
 * Very-high-fibre seeds. Their stated calories come from labels that count
 * fibre as energy — most of it is fermentable and carries roughly 2 kcal/g,
 * which the four columns cannot express. The rows are correct as written and
 * simply will not reconcile against 4/4/9. Both carry more fibre than
 * available carbohydrate, which is what makes the residue large enough to
 * matter here and negligible everywhere else.
 */
const FIBRE_ENERGY_ROWS = new Set(["chia-seeds", "flaxseed"]);

/** Relative error on a 2-kcal food is meaningless. */
const TRIVIAL_KCAL = 20;

const atwater = (f: FoodSeed) => 4 * f.proteinG + 4 * f.carbsG + 9 * f.fatG;

suite("food library macro consistency", () => {
  // Carbohydrate is available carbohydrate (UK label convention): fibre is
  // listed separately and not counted twice. The residue against the 4/4/9
  // sum is therefore fibre at roughly 2 kcal/g, which is why high-fibre rows
  // like bran flakes sit near the bottom of the tolerance and are correct.
  it("reconciles every row to within 10% of its stated calories", () => {
    const failures: string[] = [];
    for (const f of FOODS) {
      if (ALCOHOL.has(f.slug) || FIBRE_ENERGY_ROWS.has(f.slug)) continue;
      if (f.kcal < TRIVIAL_KCAL) continue;
      const deviation = (atwater(f) - f.kcal) / f.kcal;
      if (Math.abs(deviation) > 0.1) {
        failures.push(
          `${f.slug}: stated ${f.kcal} kcal, macros give ${atwater(f).toFixed(0)} ` +
          `(${(deviation * 100).toFixed(1)}%)`,
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("keeps the library's mean deviation small, not merely inside the bound", () => {
    const checked = FOODS.filter(
      (f) => !ALCOHOL.has(f.slug) && !FIBRE_ENERGY_ROWS.has(f.slug) && f.kcal >= TRIVIAL_KCAL,
    );
    const mean =
      checked.reduce((sum, f) => sum + Math.abs((atwater(f) - f.kcal) / f.kcal), 0) / checked.length;
    // Measured at 2.8% when the library was written. A jump here means rows
    // are being added by guesswork even while each stays inside the bound.
    expect(mean).toBeLessThan(0.05);
  });

  // The exemptions are deliberate, so they are asserted rather than assumed:
  // if a slug is renamed, this fails instead of silently exempting nothing.
  it("exempts only rows that still exist", () => {
    const slugs = new Set(FOODS.map((f) => f.slug));
    for (const slug of [...ALCOHOL, ...FIBRE_ENERGY_ROWS]) {
      expect(slugs.has(slug), `exempted "${slug}" is not in the library`).toBe(true);
    }
  });
});

suite("food library covers what she is asked to cook", () => {
  // Every meal template lists what it contains. If the library cannot price an
  // ingredient, the calculator falls back to a model estimate for a food we
  // planned for her ourselves — which is the one case we have no excuse for.
  it("prices the ingredients named by the meal templates", () => {
    const lookup = new Set<string>();
    for (const f of FOODS) {
      lookup.add(f.name.toLowerCase());
      for (const a of f.aliases) lookup.add(a.trim().toLowerCase());
    }

    const known = (ingredient: string) => {
      const q = ingredient.trim().toLowerCase();
      if (lookup.has(q)) return true;
      for (const entry of lookup) if (entry.includes(q) || q.includes(entry)) return true;
      return false;
    };

    const missing = new Set<string>();
    for (const t of MEAL_TEMPLATES) {
      for (const ingredient of t.contains) {
        if (!known(ingredient)) missing.add(ingredient);
      }
    }

    // Ground spices are mostly fibre and no carb figure reconciles with their
    // stated calories; a pinch is about 2 kcal. Left to the coach on purpose.
    const ALLOWED_MISSES = new Set(["cinnamon"]);
    const unexpected = [...missing].filter((m) => !ALLOWED_MISSES.has(m));
    expect(unexpected, `meal templates name foods the library cannot price: ${unexpected.join(", ")}`).toEqual([]);
  });
});
