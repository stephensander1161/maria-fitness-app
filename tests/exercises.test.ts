import { describe as suite, expect, it } from "vitest";
import { EXERCISES } from "@/lib/seed/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/seed/workout-templates";
import { matchesQuery, queryWords } from "@/lib/search-terms";
import { PATTERNS, patternFor } from "@/lib/movement-patterns";

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
  it("never offers a variation whose apparatus it is hiding", () => {
    // `equipment` reads as "any of these will do", which is right for a
    // dumbbell or a kettlebell and wrong for a bar you hang from. A weighted
    // pull-up lists bar, dumbbell and belt, so someone owning dumbbells and no
    // bar was shown the weighted variant while the plain pull-up it is built
    // on was hidden — a harder movement outranking its own parent.
    const barred = EXERCISES.filter((e) => e.equipment.some((x) => /pull-up bar/i.test(x)));
    expect(barred.length).toBeGreaterThan(15);
    const unmarked = barred
      // An assisted-pull-up machine is its own apparatus and needs no bar.
      .filter((e) => !e.equipment.some((x) => /machine/i.test(x)))
      .filter((e) => e.requires !== "pull-up bar")
      .map((e) => e.slug);
    expect(
      unmarked,
      `these hang from a bar but do not require one: ${unmarked.join(", ")}`,
    ).toEqual([]);
  });

  it("gives every tagged rehab movement a safety note", () => {
    const missing = EXERCISES
      .filter((e) => (e.tags ?? []).some((t) => /physio|postpartum|rehab/.test(t)))
      .filter((e) => !e.safetyNote)
      .map((e) => e.slug);
    expect(missing, `rehab content with no safety note: ${missing.join(", ")}`).toEqual([]);
  });
});

suite("the words people actually type", () => {
  const curl = { name: "Dumbbell Bicep Curl", muscles: ["biceps"], tags: [] };

  it("finds a movement whose name has other words in the middle", () => {
    // "dumbbell curl" found nothing at all: the library calls it "Dumbbell
    // Bicep Curl", and the phrase match wanted the two words adjacent. The
    // coach then told her the library had no dumbbell curl.
    expect(matchesQuery("dumbbell curl", curl)).toBe(true);
    expect(matchesQuery("curl dumbbell", curl)).toBe(true);
  });

  it("expands the abbreviations and the typo everybody makes", () => {
    expect(queryWords("db curl")).toEqual(["dumbbell", "curl"]);
    expect(queryWords("dumbell curl")).toEqual(["dumbbell", "curl"]);
    expect(matchesQuery("db curl", curl)).toBe(true);
  });

  it("is still an AND, so it does not match everything", () => {
    expect(matchesQuery("barbell curl", curl)).toBe(false);
    expect(matchesQuery("dumbbell squat", curl)).toBe(false);
    // A single word still has to be a real substring — "cur" is not a search.
    expect(matchesQuery("dumbbell", curl)).toBe(true);
    expect(matchesQuery("zzz", curl)).toBe(false);
  });

  it("keeps the phrase behaviour it already had", () => {
    const pullUp = { name: "Assisted Pull-Up", muscles: ["lats"], tags: [] };
    for (const q of ["pull up", "pull-up", "pullup", "pull ups"]) {
      expect(matchesQuery(q, pullUp), q).toBe(true);
    }
  });
});

suite("the figure shows the movement it is labelled with", () => {
  it("draws a lateral raise front-on and a front raise from the side", () => {
    // A lateral raise seen side-on is an arm pointing at the viewer that
    // barely appears to move — which is what the "raise" figure was showing,
    // and it is a front raise.
    expect(patternFor("lateral-raise", "isolation")).toBe("lateral");
    expect(patternFor("palms-up-lateral-raise", "isolation")).toBe("lateral");
    expect(patternFor("front-raise", "isolation")).toBe("raise");
    expect(patternFor("palms-up-front-raise", "isolation")).toBe("raise");
  });

  it("keeps the rest of the raises where they were", () => {
    for (const slug of ["calf-raise", "single-leg-calf-raise", "tricep-pushdown"]) {
      expect(patternFor(slug, "isolation"), slug).toBe("raise");
    }
  });

  it("does not draw a side bend as a squat", () => {
    expect(patternFor("dumbbell-side-bend", "core")).toBe("rotation");
  });

  it("the lateral pose actually takes the arm out to the side", () => {
    const p = PATTERNS.lateral;
    // The hand travels a long way sideways and ends near shoulder height.
    expect(Math.abs(p.end.hand[0] - p.start.hand[0])).toBeGreaterThan(15);
    expect(p.end.hand[1]).toBeLessThan(p.start.hand[1]);
    expect(p.end.hand[1]).toBeCloseTo(p.end.shoulder[1], -1);
  });
});

suite("a shrug is shoulders, not arms", () => {
  it("lifts the shoulders and leaves the arms hanging", () => {
    // Drawn with the "raise" pose the arms came out to the side, which is a
    // lateral raise and not a shrug at all.
    expect(patternFor("dumbbell-shrug", "isolation")).toBe("shrug");
    const p = PATTERNS.shrug;
    // Up: y decreases.
    expect(p.end.shoulder[1]).toBeLessThan(p.start.shoulder[1]);
    // And the arms hang: they travel the same distance up, and not sideways.
    expect(p.end.hand[0]).toBe(p.start.hand[0]);
    expect(p.start.hand[1] - p.end.hand[1]).toBe(p.start.shoulder[1] - p.end.shoulder[1]);
    // The head does not move; that is what makes it read as shoulders rising.
    expect(p.end.head).toEqual(p.start.head);
  });
});
