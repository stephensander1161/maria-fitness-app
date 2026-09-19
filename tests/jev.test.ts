import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { decide, jevConfigured } from "@/lib/jev";
import { MATCH_CONFIDENCE, pickMatch } from "@/lib/food-match";
import { splitCompound } from "@/lib/shopping-normalise";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("a decision, not a sentence — 2026-09-18", () => {
  it("without a key, every decision is null and nothing is sent", async () => {
    // The unit suite has no key by design; this is the fallback every caller relies on.
    expect(jevConfigured()).toBe(false);
    expect(await decide({ a: 1 }, {})).toBeNull();
  });

  it("the food match is confidence-gated, and none is a real answer", () => {
    const rows = [{ slug: "pizza-margherita", name: "Pizza", category: "prepared" }, { slug: "pizza-pizza-slice", name: "Pizza Pizza slice", category: "prepared" }];
    expect(pickMatch(null, rows)).toEqual({ kind: "unsure" });
    expect(pickMatch({ choice: "pizza-margherita", confidence: MATCH_CONFIDENCE - 0.01 }, rows)).toEqual({ kind: "unsure" });
    expect(pickMatch({ choice: "pizza-margherita", confidence: 0.9 }, rows)).toMatchObject({ kind: "row", row: rows[0] });
    expect(pickMatch({ choice: "none", confidence: 0.8 }, rows)).toMatchObject({ kind: "none" });
    // A label outside the candidates cannot happen, and is unsure if it does.
    expect(pickMatch({ choice: "ghost", confidence: 0.99 }, rows)).toEqual({ kind: "unsure" });
  });

  it("splits a compound line the way a shopper would", () => {
    expect(splitCompound("2 cups lettuce, tomato, red onion")).toEqual(["2 cups lettuce", "tomato", "red onion"]);
    expect(splitCompound("salt and pepper")).toEqual(["salt", "pepper"]);
    expect(splitCompound("olive oil")).toEqual(["olive oil"]);
  });

  it("is wired where the app decides, and every caller keeps its old answer without it", () => {
    const foods = read("lib/tools/foods.ts");
    expect(foods).toMatch(/const verdict = await chooseFood\(portion\.query, matches\);/);
    expect(foods).toMatch(/: matches\[0\];/);
    const list = read("lib/shopping-list.ts");
    expect(list).toMatch(/aggregateIngredients\(await splitLines\(/);
    expect(list).toMatch(/await aislesFor\(/);
    // No browser component reaches the decision client.
    for (const f of fs.readdirSync("components")) {
      expect(read(`components/${f}`), f).not.toMatch(/lib\/jev"|@typesafe-ai\/sdk/);
    }
    // The client never retries and never waits long: the fallback is right there.
    const jev = read("lib/jev.ts");
    expect(jev).toMatch(/timeout: 1500/);
    expect(jev).toMatch(/maxRetries: 0/);
  });
});
