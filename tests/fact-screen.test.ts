import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { preferredCategory } from "@/lib/fact-screen";
import { FACTS } from "@/lib/seed/facts";

suite("the card takes the subject of the screen it is on", () => {
  it("prefers food where a food decision is being made", () => {
    expect(preferredCategory("/eat")).toBe("nutrition");
    expect(preferredCategory("/kitchen")).toBe("nutrition");
    expect(preferredCategory("/eat?d=2026-09-10")).toBe("nutrition");
  });

  it("and leaves every other screen the whole library", () => {
    // The point of the card is the thing she did not go looking for, so only
    // the screens with a specific decision on them get narrowed.
    for (const p of ["/train", "/progress", "/plan", "/friends", "/learn", "/"]) {
      expect(preferredCategory(p), p).toBeUndefined();
    }
  });

  it("has enough food facts that a week of Eat is not the same four", () => {
    const food = FACTS.filter((f) => f.category === "nutrition");
    expect(food.length).toBeGreaterThanOrEqual(35);
    // Every one carries a source, like the rest of the pool.
    for (const f of food) expect(f.source, f.slug).toBeTruthy();
  });

  it("swaps once per screen, not on every render", () => {
    const card = fs.readFileSync("components/fact-card.tsx", "utf8");
    expect(card).toMatch(/swapped\.current === path/);
    expect(card).toMatch(/action<[^>]*>\(\s*"get_fact", \{ category: prefer \}/);
  });
});
