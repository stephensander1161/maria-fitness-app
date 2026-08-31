import { describe as suite, expect, it } from "vitest";
import {
  classify,
  describe as describeSets,
  e1rm,
  summarise,
  type Performance,
  type SetSummary,
} from "@/lib/progress";

/** [reps, weightKg] — weight null means bodyweight. */
type SetSpec = [reps: number, weightKg: number | null];

const sets = (specs: SetSpec[]): SetSummary[] =>
  specs.map(([reps, weightKg], i) => ({ setNumber: i + 1, reps, weightKg, rpe: null }));

const uniform = (count: number, reps: number, weightKg: number | null): SetSummary[] =>
  sets(Array.from({ length: count }, () => [reps, weightKg] as SetSpec));

const perf = (spec: SetSummary[], date = "2026-08-24"): Performance => summarise(date, spec);

suite("e1rm", () => {
  it("uses Epley for loaded sets", () => {
    expect(e1rm(100, 30)).toBeCloseTo(200, 10); // 1 + 30/30 = 2x
    expect(e1rm(60, 10)).toBeCloseTo(80, 10);
    expect(e1rm(40, 0)).toBe(40);
  });

  it("falls back to rep count when there is no external load", () => {
    expect(e1rm(null, 12)).toBe(12);
    expect(e1rm(0, 12)).toBe(12); // a logged 0 kg behaves exactly like bodyweight
  });

  it("is monotonic in both weight and reps", () => {
    expect(e1rm(60, 11)).toBeGreaterThan(e1rm(60, 10));
    expect(e1rm(62.5, 10)).toBeGreaterThan(e1rm(60, 10));
  });
});

suite("summarise", () => {
  it("adds up reps and volume and picks the best set", () => {
    const p = perf(sets([[10, 40], [8, 50], [6, 60]]));
    expect(p.totalReps).toBe(24);
    expect(p.volumeKg).toBeCloseTo(400 + 400 + 360, 10);
    expect(p.bestSet?.setNumber).toBe(3); // 60kg×6 -> 72 beats 53.3 and 63.3
    expect(p.bestE1rm).toBeCloseTo(72, 10);
    expect(p.date).toBe("2026-08-24");
  });

  it("keeps the earliest set when two tie on estimated 1RM", () => {
    const p = perf(sets([[10, 40], [10, 40]]));
    expect(p.bestSet?.setNumber).toBe(1);
  });

  it("treats bodyweight sets as zero volume but still ranks them", () => {
    const p = perf(uniform(3, 10, null));
    expect(p.volumeKg).toBe(0);
    expect(p.totalReps).toBe(30);
    expect(p.bestE1rm).toBe(10);
    expect(p.bestSet?.reps).toBe(10);
  });

  it("counts null weights as zero in a mixed session", () => {
    const p = perf(sets([[10, null], [10, 20]]));
    expect(p.volumeKg).toBe(200);
    expect(p.totalReps).toBe(20);
  });

  it("degrades safely on an empty session", () => {
    const p = perf([]);
    expect(p).toMatchObject({ totalReps: 0, volumeKg: 0, bestE1rm: 0, bestSet: null });
  });
});

/* ── The verdict ───────────────────────────────────────────────────────── */

type Case = {
  name: string;
  previous: SetSummary[];
  current: SetSummary[];
  status: "beat" | "matched" | "missed";
  /** Omitted means "don't care"; null means the delta must be null. */
  e1rmDeltaPct?: number | null;
  volumeDeltaPct?: number | null;
};

const cases: Case[] = [
  // ── The everyday shapes of progress ──
  {
    name: "same weight, more reps",
    previous: uniform(3, 8, 40),
    current: uniform(3, 10, 40),
    status: "beat",
    volumeDeltaPct: 25,
  },
  {
    name: "same weight, fewer reps",
    previous: uniform(3, 10, 40),
    current: uniform(3, 8, 40),
    status: "missed",
    volumeDeltaPct: -20,
  },
  {
    name: "more weight, fewer reps, clear estimated-1RM gain",
    previous: uniform(3, 10, 40), // e1rm 53.33, 30 reps, 1200 kg
    current: uniform(4, 6, 50), //   e1rm 60.00, 24 reps, 1200 kg
    status: "beat",
    volumeDeltaPct: 0, // identical volume, and fewer total reps: e1rm carries it
  },
  {
    name: "more weight, fewer reps, landing inside the tolerance band",
    previous: uniform(3, 10, 40), // e1rm 53.333
    current: uniform(3, 8, 42), //   e1rm 53.200 -> -0.25%
    status: "matched",
  },
  {
    name: "more weight but far fewer reps is a genuine miss",
    previous: uniform(3, 10, 40), // e1rm 53.333
    current: uniform(3, 3, 45), //   e1rm 49.500 -> -7.2%
    status: "missed",
  },
  {
    name: "exactly the same session",
    previous: uniform(4, 8, 45),
    current: uniform(4, 8, 45),
    status: "matched",
    e1rmDeltaPct: 0,
    volumeDeltaPct: 0,
  },

  // ── The 2% band, either side. Base sets are chosen so e1rm is exactly 100. ──
  {
    name: "+2.0% estimated 1RM (the band's upper edge) is matched, not beat",
    previous: sets([[30, 50]]), // e1rm 100
    current: sets([[30, 51]]), //  e1rm 102
    status: "matched",
    e1rmDeltaPct: 2,
  },
  {
    name: "+3.0% estimated 1RM clears the band",
    previous: sets([[30, 50]]),
    current: sets([[30, 51.5]]), // e1rm 103
    status: "beat",
    e1rmDeltaPct: 3,
  },
  {
    name: "-2.0% estimated 1RM (the band's lower edge) is still matched",
    previous: sets([[30, 50]]),
    current: sets([[30, 49]]), // e1rm 98
    status: "matched",
    e1rmDeltaPct: -2,
  },
  {
    name: "-2.2% estimated 1RM drops out of the band",
    previous: sets([[30, 50]]),
    current: sets([[30, 48.9]]), // e1rm 97.8
    status: "missed",
    e1rmDeltaPct: -2.2,
  },

  // ── Single set vs many ──
  {
    name: "same weight and reps but five sets instead of one",
    previous: uniform(1, 10, 60),
    current: uniform(5, 10, 60),
    status: "beat", // on the total-reps rule; the best set is unchanged
    e1rmDeltaPct: 0,
    volumeDeltaPct: 400,
  },
  {
    name: "four of five sets abandoned at the same weight is a shortfall",
    // Regression: the rep rule only ever promoted, never demoted, so 80% of
    // the work vanishing was headlined "held level with last time".
    previous: uniform(5, 10, 60),
    current: uniform(1, 10, 60),
    status: "missed",
    e1rmDeltaPct: 0,
    volumeDeltaPct: -80,
  },
  {
    name: "a collapse in load is a shortfall even when total reps went up",
    // Regression: 100kg×5 -> 20kg×3s is an 81% drop in estimated 1RM, which
    // used to read as "beat" purely because the rep count rose.
    previous: sets([[5, 100]]),
    current: uniform(10, 3, 20),
    status: "missed",
    e1rmDeltaPct: -81.14285714285714,
    volumeDeltaPct: 20,
  },

  // ── Bodyweight (weightKg null): e1rm falls back to reps, volume is always 0 ──
  {
    name: "bodyweight: more reps per set",
    previous: uniform(3, 10, null),
    current: uniform(3, 12, null),
    status: "beat",
    e1rmDeltaPct: 20,
    volumeDeltaPct: null, // previous volume is 0, so the percentage is undefined
  },
  {
    name: "bodyweight: fewer reps per set",
    previous: uniform(3, 10, null),
    current: uniform(3, 8, null),
    status: "missed",
    e1rmDeltaPct: -20,
    volumeDeltaPct: null,
  },
  {
    name: "bodyweight: identical session",
    previous: uniform(3, 10, null),
    current: uniform(3, 10, null),
    status: "matched",
    e1rmDeltaPct: 0,
    volumeDeltaPct: null,
  },
  {
    name: "bodyweight: the same total reps split into two sets holds level",
    // Regression: best-set e1rm halves when 1×50 becomes 2×25, which used to
    // read as a 50% collapse despite identical work.
    previous: sets([[50, null]]),
    current: uniform(2, 25, null),
    status: "matched",
    e1rmDeltaPct: -50,
    volumeDeltaPct: null,
  },
  {
    name: "a logged 0 kg is handled like bodyweight, not like a 0 kg lift",
    previous: uniform(3, 10, 0),
    current: uniform(3, 12, 0),
    status: "beat",
    e1rmDeltaPct: 20,
    volumeDeltaPct: null,
  },

  // ── Zero-volume and empty edges ──
  {
    name: "nothing logged either time",
    previous: [],
    current: [],
    status: "matched", // 0 >= 0 * 0.98
    e1rmDeltaPct: null,
    volumeDeltaPct: null,
  },
  {
    name: "nothing logged previously, work logged now",
    previous: [],
    current: uniform(3, 10, 40),
    status: "beat",
    e1rmDeltaPct: null,
    volumeDeltaPct: null,
  },
  {
    name: "work logged previously, nothing logged now",
    previous: uniform(3, 10, 40),
    current: [],
    status: "missed",
    e1rmDeltaPct: -100,
    volumeDeltaPct: -100,
  },
  {
    name: "bodyweight last time, loaded this time: volume delta stays undefined",
    previous: uniform(3, 10, null),
    current: uniform(3, 10, 40),
    status: "beat",
    volumeDeltaPct: null,
  },
  {
    name: "loaded last time, bodyweight this time: volume is down 100%",
    previous: uniform(3, 10, 40),
    current: uniform(3, 10, null),
    status: "missed",
    volumeDeltaPct: -100,
  },
];

suite("classify", () => {
  for (const c of cases) {
    it(c.name, () => {
      const got = classify(perf(c.previous), perf(c.current, "2026-08-31"));
      expect(got.status).toBe(c.status);
      if ("e1rmDeltaPct" in c) {
        if (c.e1rmDeltaPct === null) expect(got.e1rmDeltaPct).toBeNull();
        else expect(got.e1rmDeltaPct).toBeCloseTo(c.e1rmDeltaPct as number, 8);
      }
      if ("volumeDeltaPct" in c) {
        if (c.volumeDeltaPct === null) expect(got.volumeDeltaPct).toBeNull();
        else expect(got.volumeDeltaPct).toBeCloseTo(c.volumeDeltaPct as number, 8);
      }
    });
  }

  it("never reports 'first' — that decision belongs to the caller", () => {
    for (const c of cases) {
      expect(classify(perf(c.previous), perf(c.current))).not.toMatchObject({ status: "first" });
    }
  });

  it("does not mutate either performance", () => {
    const previous = perf(uniform(3, 10, 40));
    const current = perf(uniform(3, 12, 40));
    const before = JSON.stringify([previous, current]);
    classify(previous, current);
    expect(JSON.stringify([previous, current])).toBe(before);
  });

  it("is a pure function of the numbers, not of the dates", () => {
    const a = classify(summarise("2020-01-01", uniform(3, 10, 40)), summarise("2026-08-31", uniform(3, 12, 40)));
    const b = classify(summarise("2026-08-24", uniform(3, 10, 40)), summarise("2026-08-25", uniform(3, 12, 40)));
    expect(a).toEqual(b);
  });

  it("reverses beat and missed when the sessions are swapped", () => {
    const worse = perf(uniform(3, 8, 40));
    const better = perf(uniform(3, 10, 40));
    expect(classify(worse, better).status).toBe("beat");
    expect(classify(better, worse).status).toBe("missed");
  });

  it("reports the estimated-1RM delta with the sign of the change", () => {
    const up = classify(perf(sets([[30, 50]])), perf(sets([[30, 60]])));
    expect(up.e1rmDeltaPct).toBeCloseTo(20, 10);
    const down = classify(perf(sets([[30, 50]])), perf(sets([[30, 40]])));
    expect(down.e1rmDeltaPct).toBeCloseTo(-20, 10);
  });
});

/* ── The sentence she reads ────────────────────────────────────────────── */

  suite("describe", () => {
    it("says so when there is nothing to say", () => {
      expect(describeSets([], "imperial")).toBe("nothing logged");
    });

    it("collapses a uniform loaded session", () => {
      expect(describeSets(uniform(3, 10, 40), "imperial")).toBe("3×10 @ 88lb");
      expect(describeSets(uniform(1, 5, 100), "imperial")).toBe("1×5 @ 220lb");
    });

    it("omits the load for a uniform bodyweight session", () => {
      expect(describeSets(uniform(3, 10, null), "imperial")).toBe("3×10");
    });

    it("lists sets individually when the reps varied", () => {
      expect(describeSets(sets([[10, 40], [8, 40], [6, 40]]), "imperial")).toBe("10@88, 8@88, 6@88");
    });

    it("lists sets individually when the weight varied", () => {
      expect(describeSets(sets([[10, 40], [10, 50]]), "imperial")).toBe("10@88, 10@110");
    });

    it("handles a session that mixes bodyweight and loaded sets", () => {
      expect(describeSets(sets([[10, null], [10, 20]]), "imperial")).toBe("10, 10@44");
    });

    it("shows a 0 kg entry as a 0lb load rather than as bodyweight", () => {
      // e1rm treats 0 like bodyweight but describe does not — a cosmetic
      // inconsistency worth knowing about if 0 ever becomes a real input.
      expect(describeSets(uniform(3, 10, 0), "imperial")).toBe("3×10 @ 0lb");
    });

    it("renders in the profile's units, not always pounds", () => {
      // Regression: this used to hardcode a pounds conversion, so a metric
      // user read "3×10 @ 88lb" for her own 40 kg sets.
      expect(describeSets(uniform(3, 10, 40), "metric")).toBe("3×10 @ 40kg");
      expect(describeSets(uniform(1, 5, 100), "metric")).toBe("1×5 @ 100kg");
      expect(describeSets(sets([[10, 40], [10, 50]]), "metric")).toBe("10@40, 10@50");
    });
  });
