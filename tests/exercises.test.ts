import { describe as suite, expect, it } from "vitest";
import { EXERCISES } from "@/lib/seed/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/seed/workout-templates";

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

suite("workout templates reference the library", () => {
  const slugs = new Set(EXERCISES.map((e) => e.slug));

  // A template is instantiated by resolving these slugs to exercise ids. One
  // that does not resolve is a hole in her week that only shows up when she
  // opens the day expecting to train.
  it("names a real movement in every slot", () => {
    const broken: string[] = [];
    for (const t of WORKOUT_TEMPLATES) {
      for (const day of t.days) {
        for (const e of day.exercises ?? []) {
          if (!slugs.has(e.exerciseSlug)) broken.push(`${t.slug}/${day.title}: ${e.exerciseSlug}`);
        }
      }
    }
    expect(broken, `templates naming movements that do not exist: ${broken.join(", ")}`).toEqual([]);
  });

  it("gives every template all seven days", () => {
    for (const t of WORKOUT_TEMPLATES) {
      expect(t.days.map((d) => d.dayOfWeek).sort((a, b) => a - b), t.slug).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it("puts exercises on training days and none on rest days", () => {
    for (const t of WORKOUT_TEMPLATES) {
      for (const d of t.days) {
        if (d.isRest) expect(d.exercises ?? [], `${t.slug} ${d.title}`).toHaveLength(0);
        else expect((d.exercises ?? []).length, `${t.slug} ${d.title}`).toBeGreaterThan(0);
      }
    }
  });

  it("matches the training days it advertises", () => {
    for (const t of WORKOUT_TEMPLATES) {
      const training = t.days.filter((d) => !d.isRest).length;
      expect(training, `${t.slug} says ${t.daysPerWeek} days but has ${training}`).toBe(t.daysPerWeek);
    }
  });
});

suite("finding the movement for a complaint", () => {
  const bySlug = new Map(EXERCISES.map((e) => [e.slug, e]));
  const taggedWith = (tag: string) =>
    EXERCISES.filter((e) => (e.tags ?? []).some((t) => t.toLowerCase().includes(tag)));

  // Nobody searches for "360 Breathing". They search for the thing that is
  // wrong. Without tags the library held exactly the right movement for a
  // complaint and could not be found by the word anyone would type.
  it("can be found by the words she would actually use", () => {
    for (const term of ["postpartum", "diastasis", "pelvic floor", "physio", "knee", "back"]) {
      expect(taggedWith(term).length, `nothing tagged "${term}"`).toBeGreaterThan(0);
    }
  });

  it("tags the whole post-partum progression, not just some of it", () => {
    const expected = [
      "diaphragmatic-breathing", "pelvic-floor-activation", "pelvic-floor-relaxation",
      "tva-activation", "postpartum-connection-breath", "core-heel-slide", "supine-march",
      "wall-plank", "incline-plank", "standing-pelvic-tilt", "happy-baby",
    ];
    for (const slug of expected) {
      const e = bySlug.get(slug);
      expect(e, `${slug} missing from the library`).toBeDefined();
      expect((e!.tags ?? []).join(" "), `${slug} is not findable as post-partum`).toContain("postpartum");
    }
  });

  // This content is offered for a complaint, so it must say when to stop.
  it("gives every tagged rehab movement a safety note", () => {
    const missing = EXERCISES
      .filter((e) => (e.tags ?? []).some((t) => /physio|postpartum|rehab/.test(t)))
      .filter((e) => !e.safetyNote)
      .map((e) => e.slug);
    expect(missing, `rehab content with no safety note: ${missing.join(", ")}`).toEqual([]);
  });
});
