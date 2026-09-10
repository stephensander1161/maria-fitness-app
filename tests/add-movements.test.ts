import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("lib/tools/training.ts", "utf8");
const persona = fs.readFileSync("lib/agent/system.ts", "utf8");

suite("adding movements is one call, names and all", () => {
  it("takes the names she used, not slugs from a search first", () => {
    // Four movements meant search_exercises for each, a round trip to read
    // the results, then four more calls — and what actually happened was that
    // the model searched, narrated what the library had, and stopped. Nothing
    // was added and the reply sounded like progress.
    expect(src).toMatch(/movements: z\.array\(z\.object\(\{/);
    expect(src).toMatch(/async function resolveMovement/);
    expect(src).toMatch(/you do not need search_exercises first/);
  });

  it("adds what it found even when part of the list is missing", () => {
    // Losing three movements over a fourth she spelled unusually is the wrong
    // failure — and the ones it could not place come back named, with the
    // nearest matches, rather than being dropped in silence.
    expect(src).toMatch(/const notFound: \{ asked: string; nearest: string\[\] \}\[\] = \[\]/);
    expect(src).toMatch(/async function nearestMovements/);
    expect(src).toMatch(/note: "Tell her which ones are not in the library\."/);
    // Only a list with nothing in it at all is a failure.
    expect(src).toMatch(/if \(added\.length === 0\)/);
  });

  it("matches the way people spell things", () => {
    // The same tolerance the picker and the food library have: "benchpress",
    // "bench press", "bench-press".
    expect(src).toMatch(/const squashed = term\.toLowerCase\(\)\.replace\(\/\[\\s-\]\/g, ""\)/);
    // Shortest name wins, so "bench press" is Bench Press and not Close-Grip.
    expect(src).toMatch(/\.orderBy\(sql`length\(\$\{exercises\.name\}\)`\)/);
  });

  it("and editing a target takes a name too", () => {
    // "Make bench 5 sets" needed get_plan first, purely to learn a string.
    expect(src).toMatch(/Matched against the day rather than the library/);
    expect(src).toMatch(/onThatDay: onDay\.map\(\(r\) => r\.name\)/);
  });

  it("the persona says to add rather than to report what it found", () => {
    expect(persona).toMatch(/Searching and then describing what you found is not adding anything/);
    expect(persona).toMatch(/One call per \*day\* she means, never one per movement/);
  });
});
