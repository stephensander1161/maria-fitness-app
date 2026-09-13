import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { runTool } from "@/lib/tools";
import { addDays } from "@/lib/date";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * Eating, against a real database.
 *
 * Almost every rule in the "unknown is not zero" section of CLAUDE.md lives
 * in these handlers, and none of them can be checked without rows: a meal
 * logged in words carries no calorie figure, a day with no logs is not a
 * zero-calorie day, and a portion in a measure the food is not sold in
 * returns null rather than a plausible number. Each one has been a real bug,
 * and each one is a query away from coming back.
 */
let a: TestAccount;

beforeAll(async () => { a = await makeAccount("nutrition"); });
afterAll(async () => { await dropAccount(a); });

const call = <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
  runTool(name, input, a.ctx) as Promise<T>;

type Day = {
  date: string;
  logged: { logId: string; slot: string; description: string; calories: number | null }[];
  totals?: Record<string, unknown>;
};

suite("a meal logged in words carries no numbers", () => {
  it("says which figures it did not get, and how to fill them", async () => {
    // The bug this exists to stop: "leftovers" and "dinner at Mum's" were
    // summed as zero, the day counted as logged, and the coach congratulated
    // her on a deficit she never ran.
    const out = await call<{ ok: boolean; logId: string; loggedWithout: string[] }>("log_meal", {
      slot: "dinner", description: "leftovers",
    });
    expect(out.ok).toBe(true);
    expect(out.loggedWithout).toEqual(
      expect.arrayContaining(["calories", "protein", "carbs", "fat", "fibre"]),
    );
  });

  it("marks the day incomplete rather than reporting a total it does not have", async () => {
    const day = await call<Day & { caloriesAreComplete?: boolean }>("get_day_nutrition");
    const words = day.logged.find((l) => l.description === "leftovers");
    expect(words?.calories).toBeNull();
    // Not a zero, and not omitted — it is on the day, with nothing in it.
    expect(JSON.stringify(day)).toMatch(/complete|floor|≥|at least/i);
  });

  it("counts a fully figured meal, and still knows which macros are missing", async () => {
    const out = await call<{ ok: boolean; logId: string; loggedWithout: string[] }>("log_meal", {
      slot: "lunch", description: "chicken and rice", calories: 600, proteinG: 45,
    });
    expect(out.loggedWithout).toContain("fibre");
    expect(out.loggedWithout).not.toContain("calories");
  });
});

suite("correcting what she ate", () => {
  let lunchId = "";

  it("updates the most recent entry in a slot without being given an id", async () => {
    // Her most common correction, and she will not be reading ids out.
    const out = await call<{ ok: boolean; was: Record<string, unknown>; now: Record<string, unknown> }>(
      "update_meal_log", { slot: "lunch", calories: 650 },
    );
    expect(out.ok).toBe(true);
    expect(out.was.calories).toBe(600);
    expect(out.now.calories).toBe(650);
  });

  it("refuses an id that is not an id, rather than throwing at Postgres", async () => {
    // An invented id used to reach the database as a malformed uuid and come
    // back as a 500. It is a recoverable answer now: get one from the tool
    // that lists them.
    const out = await call<{ ok?: boolean; error?: string; issues?: string[] }>("update_meal_log", {
      logId: "the-one-from-lunch", calories: 700,
    });
    expect(out.ok ?? false).toBe(false);
    expect(JSON.stringify(out)).toMatch(/not an id|get_day_nutrition|invalid/i);
  });

  it("removes one entry by its id and leaves the rest", async () => {
    const before = await call<Day>("get_day_nutrition");
    lunchId = before.logged.find((l) => l.slot === "lunch")!.logId;
    const out = await call<{ ok: boolean }>("remove_meal_log", { logId: lunchId });
    expect(out.ok).toBe(true);
    const after = await call<Day>("get_day_nutrition");
    expect(after.logged.map((l) => l.logId)).not.toContain(lunchId);
    expect(after.logged.length).toBe(before.logged.length - 1);
  });

  it("clears a whole day when she asks for one", async () => {
    const out = await call<{ ok: boolean; removed: number }>("clear_meal_logs", {});
    expect(out.ok).toBe(true);
    expect(out.removed).toBeGreaterThan(0);
    expect((await call<Day>("get_day_nutrition")).logged).toHaveLength(0);
  });
});

suite("a window that is mostly empty refuses to judge her eating", () => {
  it("says no-data rather than averaging nothing", async () => {
    const out = await call<{ trend: string; daysLogged: number; avgCaloriesOnLoggedDays: number | null }>(
      "get_nutrition_trend", {},
    );
    expect(out.daysLogged).toBe(0);
    expect(out.trend).toBe("no-data");
    // Never 0 — a day nobody logged is not a day she did not eat.
    expect(out.avgCaloriesOnLoggedDays).toBeNull();
  });

  it("averages only the days that were fully counted", async () => {
    // Three counted days and one in words. The average must come from three.
    for (let i = 1; i <= 3; i++) {
      await call("log_meal", {
        slot: "lunch", description: `counted ${i}`, calories: 1000,
        proteinG: 60, carbsG: 90, fatG: 30, fibreG: 10, date: addDays(a.today, -i),
      });
    }
    await call("log_meal", { slot: "dinner", description: "at a friend's", date: addDays(a.today, -4) });

    const out = await call<{
      daysLogged: number; avgCaloriesOnLoggedDays: number | null; trend: string;
    }>("get_nutrition_trend", {});
    expect(out.daysLogged).toBe(4);
    expect(out.avgCaloriesOnLoggedDays).toBe(1000);
  });
});

suite("looking food up", () => {
  it("finds a food in the library and gives it per 100g", async () => {
    const rows = await call<{ name: string; per100g: { kcal: number } }[]>("search_food_library", {
      query: "oats",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].per100g.kcal).toBeGreaterThan(0);
  });

  it("reads a restaurant item off the chain's own panel", async () => {
    // These are per-item rows rather than per-100g: a small fries is a thing,
    // not a weight, and the table could not represent one until it could.
    const rows = await call<{ name: string }[]>("search_food_library", { query: "McDonald" });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses a lookup with no food named", async () => {
    const out = await call<{ error?: string }>("lookup_food", {});
    expect(out.error).toBe("Invalid arguments");
  });
});

suite("her kitchen", () => {
  it("adds, adjusts and removes a line, in the units it was given", async () => {
    // Amounts are never converted: grams, tablespoons and tins are compared
    // like with like, and a mismatch is unknown rather than a number.
    const added = await call<{ ok: boolean; added: { item: string; nowHolding: string }[] }>(
      "add_to_pantry", { items: [{ item: "rice", amount: 500, unit: "g" }] },
    );
    expect(added.added[0].nowHolding).toBe("500g");

    const set = await call<{ ok: boolean; nowHolding: string }>("set_pantry_item", {
      item: "rice", amount: 200, unit: "g",
    });
    expect(set.nowHolding).toBe("200g");

    const removed = await call<{ ok: boolean; removed: string }>("remove_pantry_item", { item: "rice" });
    expect(removed.removed).toBe("rice");
  });

  it("restocks the same line instead of opening a second row", async () => {
    // `(profile, item, unit)` is unique and the unit column stores "" rather
    // than NULL, because Postgres never considers two NULLs equal.
    await call("add_to_pantry", { items: [{ item: "eggs", amount: 6 }] });
    const twice = await call<{ added: { item: string; nowHolding: string }[] }>(
      "add_to_pantry", { items: [{ item: "eggs", amount: 6 }] },
    );
    // Normalised to the singular, and added to rather than duplicated: "4 eggs
    // plus 2 eggs" is six eggs, never 300g.
    expect(twice.added[0].item).toBe("egg");
    expect(twice.added[0].nowHolding).toBe("12");
    const pantry = await call<{ inKitchen: { item: string }[] }>("get_pantry");
    expect(pantry.inKitchen.filter((l) => l.item === "egg")).toHaveLength(1);
  });

  it("explains that unknown is not a shortage", async () => {
    const pantry = await call<{ note: string; summary: Record<string, number> }>("get_pantry");
    expect(pantry.note).toMatch(/unknown/i);
    expect(pantry.note).toMatch(/not a shortage/i);
  });
});

suite("water is the sixth macro", () => {
  it("logs a drink, sums the day, and takes the last one back", async () => {
    const logged = await call<{ ok: boolean }>("log_water", { amount: "500ml" });
    expect(logged.ok).toBe(true);

    const day = await call<{ anythingLoggedToday: boolean; drinks: unknown[] }>("get_water");
    expect(day.anythingLoggedToday).toBe(true);
    expect(day.drinks.length).toBeGreaterThan(0);

    const undone = await call<{ ok: boolean }>("remove_water_log", {});
    expect(undone.ok).toBe(true);
  });

  it("never counts a day she did not log as a day she did not drink", async () => {
    const day = await call<{ today: unknown; state: string; anythingLoggedToday: boolean }>("get_water");
    expect(day.anythingLoggedToday).toBe(false);
    expect(day.today).toBeNull();
    expect(day.state).toBe("unknown");
  });

  it("says so rather than pretending, when there is nothing to remove", async () => {
    const out = await call<{ ok: boolean; error?: string }>("remove_water_log", {});
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/nothing to remove/i);
  });
});

suite("batch cooking", () => {
  it("banks portions and hands them out one at a time", async () => {
    const cooked = await call<{ ok: boolean; id: string; portions: number }>("log_cook_session", {
      title: "chilli", portions: 4, caloriesPerPortion: 500,
    });
    expect(cooked.portions).toBe(4);

    const listed = await call<{ portions: { id: string; portionsLeft: number }[] }>("list_prepped_portions");
    expect(listed.portions.find((p) => p.id === cooked.id)?.portionsLeft).toBe(4);

    const ate = await call<{ ok: boolean; portionsLeft: number; logId: string }>(
      "eat_prepped_portion", { id: cooked.id, slot: "dinner" },
    );
    // One step, and the figures are exact rather than estimated — which is
    // the difference between a day that can be counted and one that cannot.
    expect(ate.portionsLeft).toBe(3);
    expect(ate.logId).toBeTruthy();
    const after = await call<{ portions: { id: string; portionsLeft: number }[] }>("list_prepped_portions");
    expect(after.portions.find((p) => p.id === cooked.id)?.portionsLeft).toBe(3);
  });

  it("refuses an id that is not one", async () => {
    const out = await call<{ ok?: boolean; error?: string }>(
      "eat_prepped_portion", { id: "the-chilli", slot: "lunch" },
    );
    expect(out.ok ?? false).toBe(false);
  });
});

suite("the meals she has before", () => {
  it("offers recent ones back, ready to log again", async () => {
    const out = await call<{ meals: { description: string }[]; hint: string }>("get_recent_meals");
    expect(out.meals.length).toBeGreaterThan(0);
    expect(out.hint).toBeTruthy();
  });

  it("saves one by name and lists it", async () => {
    const saved = await call<{ ok: boolean }>("save_meal", {
      title: "my usual", slot: "breakfast", description: "oats", calories: 400,
    });
    expect(saved.ok).toBe(true);
    const list = await call<{ meals: { description: string }[] }>("list_saved_meals");
    expect(list.meals.map((m) => m.description)).toContain("oats");
  });
});

suite("one fact a day, out of the library", () => {
  it("returns a fact with what it is about and where it came from", async () => {
    const out = await call<{ category: string; fact: string; source: string | null }>("get_fact");
    expect(out.fact.length).toBeGreaterThan(20);
    expect(out.category).toBeTruthy();
  });

  it("can be asked for one on a subject", async () => {
    const out = await call<{ category: string }>("get_fact", { category: "strength" });
    expect(out.category).toBe("strength");
  });
});
