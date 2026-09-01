import { describe as suite, expect, it } from "vitest";
import { groupRecentMeals } from "@/lib/views";

const row = (
  date: string, slot: string, description: string,
  calories: number | null = 400, proteinG: number | null = 20, fibreG: number | null = null,
) => ({ date, slot, description, calories, proteinG, fibreG });

suite("the meals she repeats", () => {
  it("counts repeats and puts the most frequent first", () => {
    const r = groupRecentMeals([
      row("2026-08-31", "breakfast", "Porridge and berries"),
      row("2026-08-30", "lunch", "Chicken salad"),
      row("2026-08-30", "breakfast", "Porridge and berries"),
      row("2026-08-29", "breakfast", "Porridge and berries"),
    ]);
    expect(r[0].description).toBe("Porridge and berries");
    expect(r[0].times).toBe(3);
    expect(r[1].times).toBe(1);
  });

  // The ordering assumption this was extracted to pin down. Rows arrive newest
  // first, so the first sighting supplies the macros — the version she most
  // recently thought was right. Fed the other way round it would quietly
  // resurrect the old numbers.
  it("keeps the macros from the most recent time she logged it", () => {
    const r = groupRecentMeals([
      row("2026-08-31", "breakfast", "Porridge", 420, 22, 8),
      row("2026-08-28", "breakfast", "Porridge", 300, 10, 2),
    ]);
    expect(r[0].calories).toBe(420);
    expect(r[0].proteinG).toBe(22);
    expect(r[0].fibreG).toBe(8);
    expect(r[0].lastEaten).toBe("2026-08-31");
    expect(r[0].times).toBe(2);
  });

  it("groups case-insensitively and ignores surrounding space", () => {
    const r = groupRecentMeals([
      row("2026-08-31", "lunch", "Chicken Salad"),
      row("2026-08-30", "lunch", "  chicken salad  "),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].times).toBe(2);
    // The label shown is the one she most recently typed.
    expect(r[0].description).toBe("Chicken Salad");
  });

  // The same food at a different time of day is a different suggestion: she
  // does not want porridge offered for dinner.
  it("keeps the same food in different slots apart", () => {
    const r = groupRecentMeals([
      row("2026-08-31", "breakfast", "Eggs on toast"),
      row("2026-08-31", "dinner", "Eggs on toast"),
    ]);
    expect(r).toHaveLength(2);
  });

  it("breaks a tie on how recently she ate it", () => {
    const r = groupRecentMeals([
      row("2026-08-31", "lunch", "Newer"),
      row("2026-08-20", "lunch", "Older"),
    ]);
    expect(r.map((m) => m.description)).toEqual(["Newer", "Older"]);
  });

  it("respects the limit and copes with nothing logged", () => {
    expect(groupRecentMeals([], 6)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => row("2026-08-31", "snack", `Snack ${i}`));
    expect(groupRecentMeals(many, 3)).toHaveLength(3);
  });

  it("carries an unknown fibre through as unknown, not zero", () => {
    const r = groupRecentMeals([row("2026-08-31", "lunch", "Deli sandwich", 500, 25, null)]);
    expect(r[0].fibreG).toBeNull();
  });
});
