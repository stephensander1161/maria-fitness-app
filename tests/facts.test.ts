import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { LATE_FROM, LATE_UNTIL, SLEEP_SHARE, isLate, preferredTopic } from "@/lib/fact-timing";
import { FACTS } from "@/lib/seed/facts";

suite("sleep facts after ten at night", () => {
  it("counts the night as ten in the evening until four in the morning", () => {
    expect(LATE_FROM).toBe(22);
    expect(isLate(21)).toBe(false);
    expect(isLate(22)).toBe(true);
    expect(isLate(23)).toBe(true);
    expect(isLate(0)).toBe(true);
    expect(isLate(LATE_UNTIL - 1)).toBe(true);
    expect(isLate(LATE_UNTIL)).toBe(false);
    expect(isLate(12)).toBe(false);
  });

  it("prefers sleep for most picks late at night, and for none in the day", () => {
    expect(SLEEP_SHARE).toBeGreaterThan(0.5);
    expect(SLEEP_SHARE).toBeLessThan(1); // not all, or the card becomes a nag
    expect(preferredTopic(23, 0)).toBe("sleep");
    expect(preferredTopic(23, SLEEP_SHARE - 0.01)).toBe("sleep");
    expect(preferredTopic(23, SLEEP_SHARE)).toBeUndefined();
    expect(preferredTopic(14, 0)).toBeUndefined();
    // Over many rolls, the share holds.
    const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000);
    const sleepy = rolls.filter((r) => preferredTopic(22, r) === "sleep").length;
    expect(sleepy).toBe(Math.round(SLEEP_SHARE * 1000));
  });

  it("every fact about sleep carries the topic, and there are enough of them to vary", () => {
    const tagged = FACTS.filter((f) => f.topic === "sleep");
    expect(tagged.length).toBeGreaterThanOrEqual(8);
    for (const f of FACTS) {
      if (/sleep/i.test(f.slug)) expect(f.topic, `${f.slug} is about sleep but not tagged`).toBe("sleep");
    }
    // Caffeine and alcohol facts are about sleep too, and the slug does not say so.
    expect(FACTS.find((f) => f.slug === "caffeine-half-life")?.topic).toBe("sleep");
    expect(FACTS.find((f) => f.slug === "alcohol-sleep")?.topic).toBe("sleep");
  });

  it("the seed writes the topic — it silently dropped it once", () => {
    expect(fs.readFileSync("lib/seed/run.ts", "utf8")).toMatch(/topic: f\.topic \?\? null/);
  });

  it("is judged in her timezone on both surfaces", () => {
    // The card in the layout and the coach's get_fact both ask for the hour
    // where she is — a server in UTC would call nine at night four in the
    // morning for Alberta.
    expect(fs.readFileSync("components/daily-fact.tsx", "utf8")).toMatch(/hourIn\(profile\.timezone \?\? APP_TIMEZONE\)/);
    expect(fs.readFileSync("lib/tools/nutrition.ts", "utf8")).toMatch(/preferredTopic\(hourIn\(profile\?\.timezone \?\? APP_TIMEZONE\)/);
    const lib = fs.readFileSync("lib/facts.ts", "utf8");
    expect(lib).toMatch(/preferredTopic\(hour, Math\.random\(\)\)/);
    // A preferred topic recycles its own before widening to everything.
    expect(lib.indexOf("if (!row && topic)")).toBeLessThan(lib.indexOf("where(and(...filters))\n"));
    // …and the daytime re-read pool leaves the night's subject out, or a few
    // late evenings make every afternoon about sleep as well.
    expect(lib).toMatch(/isNull\(facts\.topic\)/);
  });
});
