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

  it("changes on every screen and every sub-tab, once each", () => {
    // Walking Train → Progress → Kitchen used to show the same sentence three
    // times, and the Plan tabs never changed it at all, because the swap only
    // fired where the screen had a subject the fact did not match.
    const card = fs.readFileSync("components/fact-card.tsx", "utf8");
    // The query string is half the key: /plan?tab=food is a different screen
    // to /plan and the path alone cannot tell them apart.
    expect(card).toMatch(/useSearchParams\(\)/);
    expect(card).toMatch(/const where = `\$\{path\}\?\$\{params\}`/);
    // Once per screen, not once per render: the effect re-runs on every state
    // change it causes, and without the guard it would fetch forever.
    expect(card).toMatch(/if \(seenOn\.current === where\) return;/);
    // Where the screen has a subject, it is still asked for.
    expect(card).toMatch(/prefer \? \{ category: prefer \} : \{\}/);
    // And it re-reads rather than spending a new fact per screen: at one new
    // one per navigation an afternoon in the app reads the library dry and
    // marks all of it seen, which is what the day's card was built to avoid.
    expect(card).toMatch(/"get_fact", \{ revisit: true/);
  });
});
