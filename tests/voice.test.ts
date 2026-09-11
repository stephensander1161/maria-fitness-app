import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { ALL_LINES, line, type Moment } from "@/lib/voice";

const TONES = ["plain", "encouraging", "hype"] as const;
const MOMENTS = Object.keys(ALL_LINES) as Moment[];
const every = MOMENTS.flatMap((m) => TONES.flatMap((t) => ALL_LINES[m][t].map((text) => ({ m, t, text }))));

suite("the app speaks in the register she picked", () => {
  it("has something to say for every moment, in all three", () => {
    // Somebody who set the coach to gym-floor got a blunt coach and then
    // "Another dot on the line." from the weigh-in, which reads as two
    // different apps.
    for (const m of MOMENTS) {
      for (const t of TONES) {
        expect(ALL_LINES[m][t].length, `${m}/${t}`).toBeGreaterThan(0);
      }
    }
  });

  it("does not repeat itself inside one list", () => {
    for (const m of MOMENTS) {
      for (const t of TONES) {
        const l = ALL_LINES[m][t];
        expect(new Set(l).size, `${m}/${t}`).toBe(l.length);
      }
    }
  });

  it("says the same thing for as long as it is on screen", () => {
    // A sentence that rewrites itself mid-read is one she cannot read, and the
    // done screen sits there until she clears it.
    expect(line("sessionDone", "hype", "w-1")).toBe(line("sessionDone", "hype", "w-1"));
  });

  it("works through plenty of them across sessions", () => {
    for (const t of TONES) {
      const seen = new Set(Array.from({ length: 200 }, (_, i) => line("sessionDone", t, `w${i}`)));
      expect(seen.size, t).toBeGreaterThan(5);
    }
  });

  it("falls back rather than rendering nothing", () => {
    // A profile with no tone set, or one carrying a value this build does not
    // know, still gets a sentence.
    expect(line("sessionDone", null, "x")).toBeTruthy();
    expect(line("sessionDone", "nonsense" as never, "x")).toBeTruthy();
  });
});

suite("a voice changes how, never what", () => {
  /*
    The persona's rule, applied to the screens. tests/system-prompt.test.ts
    holds the coach to this; the app's own copy was written in one neutral
    voice and had never been held to anything.
  */
  it("never shames her, in any register", () => {
    // The fun voice to write is exactly the one that quietly turns into
    // "no excuses".
    const shaming = /\b(no excuses|lazy|pathetic|weak|soft|discipline|earn(ed)? it|deserve|should have|shouldn't have|stop making|man up|grow up|embarrassing)\b/i;
    for (const { m, t, text } of every) {
      expect(text, `${m}/${t}: ${text}`).not.toMatch(shaming);
    }
  });

  it("is about the work, never about her body", () => {
    // Same rule the rank titles are written to: funny about the *doing*.
    //
    // Deliberately the judgemental words rather than every word about a body.
    // "lean on the trend" and "one more weigh-in" are fine and a broader
    // pattern flags them, which is how a check like this gets weakened to
    // nothing the first time it cries wolf.
    const body = /\b(fat|skinny|thin|chunky|beast|savage|shredded|ripped|jacked|swole|hench)\b/i;
    for (const { m, t, text } of every) {
      expect(text, `${m}/${t}: ${text}`).not.toMatch(body);
    }
  });

  it("reports no numbers at all", () => {
    // The register may change the sentence around a figure; it may never be
    // the thing carrying one. Three phrasings of a fact is three chances to
    // get it wrong.
    for (const { m, t, text } of every) {
      expect(text, `${m}/${t}: ${text}`).not.toMatch(/\d/);
    }
  });
});

suite("every surface that celebrates uses it", () => {
  it("the session, the scale and the night", () => {
    for (const [file, moment] of [
      ["components/session-done.tsx", "sessionDone"],
      ["components/weigh-in.tsx", "weighedIn"],
      ["components/sleep-card.tsx", "sleepLogged"],
    ] as const) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} does not speak in her register`).toMatch(new RegExp(`line\\("${moment}"`));
      // And none of them keeps a private copy that would drift.
      expect(src, `${file} still has its own list`).not.toMatch(/^const LINES = \[/m);
    }
  });

  it("and the tone actually reaches them", () => {
    expect(fs.readFileSync("app/progress/page.tsx", "utf8")).toMatch(/tone=\{profile\.coachTone\}/);
    expect(fs.readFileSync("app/train/page.tsx", "utf8")).toMatch(/tone=\{profile\.coachTone\}/);
    expect(fs.readFileSync("app/train/[slug]/page.tsx", "utf8")).toMatch(/tone=\{profile\.coachTone\}/);
  });
});
