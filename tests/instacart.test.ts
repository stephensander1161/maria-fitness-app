import { describe, expect, it, vi } from "vitest";
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

/**
 * The egress itself. This is one of only two places her data leaves the
 * server, and none of it — the key handling, what actually goes in the body,
 * the failure paths — had a test.
 */
describe("sending the list", () => {
  const item = (o: Partial<{ item: string; amount: number | null; unit: string | null; fromMeals: number }>) =>
    ({ item: "chicken breast", amount: 500, unit: "g", fromMeals: 2, ...o });

  const withEnv = async <T>(vars: Record<string, string>, run: () => Promise<T>): Promise<T> => {
    const before = { ...process.env };
    Object.assign(process.env, vars);
    try { return await run(); } finally { process.env = before; }
  };

  it("refuses to send anything when no key is configured", async () => {
    const { createShoppingListPage } = await import("@/lib/instacart");
    await withEnv({ INSTACART_API_KEY: "" }, async () => {
      await expect(createShoppingListPage({ title: "x", items: [item({})] }))
        .rejects.toThrow(/INSTACART_API_KEY/);
    });
  });

  it("sends only names and quantities, and never her body data", async () => {
    const { createShoppingListPage } = await import("@/lib/instacart");
    let sent: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ products_link_url: "https://instacart.test/l/1" }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const url = await withEnv({ INSTACART_API_KEY: "k-123", INSTACART_ENV: "development" }, () =>
      createShoppingListPage({ title: "Groceries", items: [item({}), item({ item: "oats", unit: null, amount: null })] }));

    expect(url).toBe("https://instacart.test/l/1");
    const body = JSON.parse(String(sent!.init.body));
    expect(body.line_items.map((l: { name: string }) => l.name)).toEqual(["chicken breast", "oats"]);
    // The whole payload, checked for anything that is not a grocery.
    const raw = String(sent!.init.body);
    for (const leak of ["weight", "kcal", "protein", "goal", "birth", "email"]) {
      expect(raw.toLowerCase(), leak).not.toContain(leak);
    }
    // And the key travels in the header, never in the body or the URL.
    expect(raw).not.toContain("k-123");
    expect(sent!.url).not.toContain("k-123");
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
    vi.unstubAllGlobals();
  });

  it("uses the development host only when told to", async () => {
    const { createShoppingListPage } = await import("@/lib/instacart");
    const hosts: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      hosts.push(url);
      return new Response(JSON.stringify({ products_link_url: "https://x.test/1" }), { status: 200 });
    });
    await withEnv({ INSTACART_API_KEY: "k", INSTACART_ENV: "development" }, () =>
      createShoppingListPage({ title: "x", items: [item({})] }));
    await withEnv({ INSTACART_API_KEY: "k", INSTACART_ENV: "production" }, () =>
      createShoppingListPage({ title: "x", items: [item({})] }));
    expect(hosts[0]).toContain("connect.dev.instacart.tools");
    expect(hosts[1]).toContain("connect.instacart.com");
    vi.unstubAllGlobals();
  });

  it("throws with the status and a trimmed body when Instacart refuses", async () => {
    const { createShoppingListPage } = await import("@/lib/instacart");
    vi.stubGlobal("fetch", async () => new Response("line_items[0].unit is invalid", { status: 422 }));
    await withEnv({ INSTACART_API_KEY: "k" }, async () => {
      await expect(createShoppingListPage({ title: "x", items: [item({})] }))
        .rejects.toThrow(/422.*line_items/);
    });
    vi.unstubAllGlobals();
  });

  it("throws rather than returning an empty link", async () => {
    const { createShoppingListPage } = await import("@/lib/instacart");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status: 200 }));
    await withEnv({ INSTACART_API_KEY: "k" }, async () => {
      await expect(createShoppingListPage({ title: "x", items: [item({})] }))
        .rejects.toThrow(/no link/);
    });
    vi.unstubAllGlobals();
  });
});
