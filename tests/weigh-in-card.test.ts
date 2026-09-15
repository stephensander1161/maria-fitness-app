import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the reading and the trend are different numbers", () => {
  /*
    Progress judges on the trend, and that is correct: `lib/trend.ts` is the
    whole reason no card here reads a single morning as *progress*. The goal,
    the bar and the totals are all EWMA.

    What she weighed is a different question, and the screen used to answer it
    with the trend in every place it was asked. "at top it highlights the
    weight trend which is misleading, should have todays weight as the big bold
    headline" — so the headline, the "now" line on the goal card and the
    weigh-in row are the reading, and every judgement around them is still the
    trend. Which number is shown, not which number the app believes.

    The weigh-in row is the one exception, because it is the one control that
    is about the number she stood on the scale for. It was handed the trend,
    so a morning of 181.2 read back as "Weighed in at 180.2", and tapping
    Update opened a stepper seeded with a number she had never entered — and
    that stepper saves, so the screen was set up to quietly rewrite her
    weigh-in with the app's own smoothed guess at it.
  */
  const page = read("app/progress/page.tsx");
  const card = read("components/weigh-in.tsx");

  it("hands the weigh-in row the reading", () => {
    expect(page).toMatch(/const rawLatest = weightOut\(history\[0\]\?\.weightKg \?\? null, u\);/);
    expect(page).toMatch(/<WeighIn\n(?:.*\n)*?\s*reading=\{rawLatest\}/);
    // And never the trend, under any name.
    const call = page.slice(page.indexOf("<WeighIn"), page.indexOf("/>", page.indexOf("<WeighIn")));
    expect(call).not.toMatch(/=\{current\}/);
  });

  it("shows it, and seeds the stepper from it", () => {
    expect(card).toMatch(/Weighed in at \$\{reading\}/);
    expect(card).toMatch(/useState\(reading \?\? 150\)/);
    // The old name is gone from the code rather than aliased, so the next
    // caller cannot pass the page's `current` — which is the trend — without
    // noticing. It survives only in the note explaining why.
    const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bcurrent\b/);
  });

  it("still judges the goal on the trend, which is the opposite rule", () => {
    // One morning is not progress. A goal card that moved with the scale
    // would tell her she had arrived and then that she had not.
    expect(page).toMatch(/<GoalCard\n(?:.*\n)*?\s*current=\{current\}/);
    expect(page).toMatch(/const latest = trend\.trendKg/);
  });

  it("makes the headline what she weighed, with the trend under it", () => {
    /*
      They were the other way round, which reads as the app disagreeing with
      the scale she has just stepped off: 181.2 this morning, 182.4 in 36px,
      and the real figure in grey underneath it.
    */
    const headline = page.slice(page.indexOf('<ProgressSection title={isToday'), page.indexOf("trend.confidence === \"low\""));
    expect(headline).toMatch(/\{rawLatest \?\? current \?\? "—"\}/);
    expect(headline).toMatch(/text-4xl font-bold tabular/);
    // The trend is still there, named, one size down.
    expect(headline).toMatch(/trend \{current\} \{unit\}/);
    // And the label says which day it is, rather than calling a stale reading
    // "today".
    expect(headline).toMatch(/weighedInToday \? "Today" : "Last weigh-in"/);
  });

  it("says what she weighs on the goal card, not what the app smoothed it to", () => {
    // "Started 190 · now 182.4" is a statement about her, not a judgement —
    // and the bar above it is still filled against the trend.
    expect(page).toMatch(/<GoalCard\n(?:.*\n)*?\s*reading=\{rawLatest\}/);
    const goalCard = read("components/goal-card.tsx");
    expect(goalCard).toMatch(/now \{reading \?\? current\} \{unit\}/);
  });
});
