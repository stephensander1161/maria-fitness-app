import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { fullness } from "@/lib/buddy";

const companion = fs.readFileSync("components/companion.tsx", "utf8");

suite("the meter under the companion says what it measures", () => {
  it("carries a visible label, not only an aria-label", () => {
    /*
      It was a bare rule with the word "protein" only in an aria-label — a
      label for some people and no label at all for everyone else. Under the
      coach, on screens where the coach also reports how much of today's
      allowance is left, an unlabelled meter reads as the allowance. It was
      read that way, and the two disagreed wildly because they measure
      different things.
    */
    const bar = companion.slice(companion.indexOf("{fullness !== null && ("));
    expect(bar).toMatch(/<span>Protein today<\/span>/);
    // And the figure, so it can be compared against anything else on screen.
    expect(bar).toMatch(/\{Math\.round\(fullness \* 100\)\}%/);
    // The screen-reader label stays; this is in addition to it.
    expect(bar).toMatch(/aria-label=\{`Protein today, about/);
  });
});

suite("it refuses to draw what it does not know", () => {
  const at = (proteinG: number | null, proteinTargetG: number | null, entriesToday: number) =>
    fullness({ proteinG, proteinTargetG, entriesToday } as never);

  it("shows nothing rather than an empty bar", () => {
    // Nothing logged is not zero protein — she has eaten, she has not written
    // it down — and a target nobody set is not a target of zero.
    expect(at(0, 150, 0)).toBeNull();
    expect(at(null, 150, 2)).toBeNull();
    expect(at(60, null, 2)).toBeNull();
    expect(at(60, 0, 2)).toBeNull();
  });

  it("treats every shape of missing as missing", () => {
    // An absent column arrives as `undefined`, which is not `null`, and the
    // division produced a NaN-wide bar.
    expect(at(undefined as never, 150, 2)).toBeNull();
    expect(at(60, undefined as never, 2)).toBeNull();
  });

  it("is a fraction of target, capped", () => {
    expect(at(75, 150, 2)).toBeCloseTo(0.5);
    expect(at(300, 150, 2)).toBe(1);
  });
});
