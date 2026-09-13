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

suite("and it turns over on a screen she stays on", () => {
  const card = fs.readFileSync("components/fact-card.tsx", "utf8");

  it("changes every five minutes, not only on a navigation", () => {
    // Moving around the app covers most of the day, but Train during a session
    // is one screen for forty minutes and the card under it went stale for all
    // of them.
    expect(card).toMatch(/const FACT_EVERY_MS = 5 \* 60_000;/);
    expect(card).toMatch(/Date\.now\(\) - last < FACT_EVERY_MS/);
  });

  it("does nothing while the tab is hidden", () => {
    // A phone in a pocket firing this every five minutes is a request an hour
    // for a card nobody is looking at.
    expect(card).toMatch(/document\.visibilityState !== "visible"/);
    expect(card).toMatch(/addEventListener\("visibilitychange", tick\)/);
    expect(card).toMatch(/removeEventListener\("visibilitychange", tick\)/);
  });

  it("still re-reads rather than spending a new fact each time", () => {
    // Twelve an hour on a training day would read the library dry.
    const swap = card.slice(card.indexOf("const swap = useCallback"));
    expect(swap.slice(0, 400)).toMatch(/"get_fact", \{ revisit: true/);
  });
});
