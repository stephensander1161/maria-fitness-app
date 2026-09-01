import { describe as suite, expect, it } from "vitest";
import { EXERCISES } from "@/lib/seed/exercises";

/**
 * The exercise library is the form and posture resource, and the coach
 * addresses everything in it by slug. A slug that does not resolve is a
 * recoverable error at best and a dead end in her plan at worst.
 */
suite("exercise library", () => {
  const slugs = new Set(EXERCISES.map((e) => e.slug));

  it("has a substantial catalogue", () => {
    expect(EXERCISES.length).toBeGreaterThan(120);
  });

  it("gives every movement a unique slug and name", () => {
    const seenSlug = new Set<string>();
    const seenName = new Set<string>();
    for (const e of EXERCISES) {
      expect(seenSlug.has(e.slug), `duplicate slug "${e.slug}"`).toBe(false);
      expect(seenName.has(e.name.toLowerCase()), `duplicate name "${e.name}"`).toBe(false);
      seenSlug.add(e.slug);
      seenName.add(e.name.toLowerCase());
    }
  });

  // The coach swaps movements by these. A typo here becomes "I'll give you an
  // easier option" followed by a slug that does not exist.
  it("points every easier and harder alternative at a real movement", () => {
    const broken: string[] = [];
    for (const e of EXERCISES) {
      for (const alt of [...(e.easier ?? []), ...(e.harder ?? [])]) {
        if (!slugs.has(alt)) broken.push(`${e.slug} -> ${alt}`);
      }
    }
    expect(broken, `alternatives pointing at nothing: ${broken.join(", ")}`).toEqual([]);
  });

  it("never points a movement at itself", () => {
    const selfref = EXERCISES
      .filter((e) => [...(e.easier ?? []), ...(e.harder ?? [])].includes(e.slug))
      .map((e) => e.slug);
    expect(selfref).toEqual([]);
  });

  it("gives every movement usable coaching content", () => {
    for (const e of EXERCISES) {
      expect(e.formCues.length, `${e.slug} has no form cues`).toBeGreaterThan(0);
      expect(e.commonMistakes.length, `${e.slug} has no common mistakes`).toBeGreaterThan(0);
      expect(e.primaryMuscles.length, `${e.slug} names no muscles`).toBeGreaterThan(0);
      expect(e.equipment.length, `${e.slug} names no equipment`).toBeGreaterThan(0);
    }
  });

  // Physiotherapy content specifically: these get offered for a complaint, so
  // the stop-and-check note is not optional the way it is on a bicep curl.
  it("gives every mobility movement a safety note", () => {
    const missing = EXERCISES
      .filter((e) => e.category === "mobility" && !e.safetyNote)
      .map((e) => e.slug);
    expect(missing, `mobility work without a safety note: ${missing.join(", ")}`).toEqual([]);
  });
});
