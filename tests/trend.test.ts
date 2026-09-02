import { describe as suite, expect, it } from "vitest";
import { describeTrend, trendSeries, weightTrend } from "@/lib/trend";

const w = (date: string, weightKg: number) => ({ date, weightKg });
/** Day i as a date, so a long series does not have to be written out. */
const iso = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const kg = (n: number) => `${Math.round(n * 10) / 10}kg`;

suite("the trend under the noise", () => {
  it("starts at the first reading rather than at zero", () => {
    expect(trendSeries([w("2026-01-01", 80)])[0].trend).toBe(80);
  });

  it("lags a jump instead of following it", () => {
    // A kilo of water overnight is not a kilo of her.
    const series = trendSeries([w("2026-01-01", 80), w("2026-01-02", 81)]);
    expect(series[1].trend).toBeGreaterThan(80);
    expect(series[1].trend).toBeLessThan(80.2);
  });

  it("weights a reading by how long it has been", () => {
    const daily = trendSeries([w("2026-01-01", 80), w("2026-01-02", 78)]);
    const monthly = trendSeries([w("2026-01-01", 80), w("2026-02-01", 78)]);
    // After a month away the new reading is nearly the whole story.
    expect(monthly[1].trend).toBeLessThan(daily[1].trend);
    expect(monthly[1].trend).toBeLessThan(78.5);
  });

  it("follows a real fall without overshooting it", () => {
    const points = Array.from({ length: 28 }, (_, i) =>
      w(`2026-01-${String(i + 1).padStart(2, "0")}`, 80 - i * 0.05));
    const series = trendSeries(points);
    const last = series[series.length - 1];
    expect(last.raw).toBeCloseTo(78.65, 2);
    // Trailing, as any moving average must: on a steady fall the trend sits
    // behind the raw line by about rate × halfLife / ln2 — here ~0.05kg/day
    // over ten days, so ~0.7kg. That lag is the price of not reacting to a
    // day of water, and it cancels out of the week-on-week change, which is
    // what anything user-facing actually reports.
    expect(last.trend).toBeGreaterThan(last.raw);
    expect(last.trend - last.raw).toBeGreaterThan(0.3);
    expect(last.trend - last.raw).toBeLessThan(0.9);

    // The rate itself survives the lag once the average has caught up: a week
    // of trend is a week of loss. (Early on it still under-reads, which is the
    // right way round — it under-claims progress rather than inventing it.)
    const long = trendSeries(Array.from({ length: 60 }, (_, i) => w(iso(i), 80 - i * 0.05)));
    const end = long[long.length - 1];
    const weekBefore = long[long.length - 8];
    expect(end.trend - weekBefore.trend).toBeCloseTo(-0.35, 1);
  });
});

suite("saying how much the trend can be trusted", () => {
  const fortnight = Array.from({ length: 14 }, (_, i) =>
    w(`2026-01-${String(i + 1).padStart(2, "0")}`, 80 - i * 0.04));

  it("states a weekly change when she weighs in regularly", () => {
    const t = weightTrend(fortnight, "2026-01-14");
    expect(t.confidence).toBe("high");
    expect(t.weeklyChangeKg).toBeLessThan(0);
    expect(t.weighInsLast14Days).toBe(14);
  });

  it("refuses a weekly change from two readings", () => {
    const t = weightTrend([w("2026-01-01", 80), w("2026-01-12", 79)], "2026-01-13");
    expect(t.confidence).toBe("low");
    // The honest answer, not a plausible one: she weighed twice.
    expect(t.weeklyChangeKg).toBeNull();
    expect(t.trendKg).not.toBeNull();
  });

  it("refuses when the last weigh-in is stale, however dense the history", () => {
    const t = weightTrend(fortnight, "2026-01-30");
    expect(t.confidence).toBe("low");
    expect(t.weeklyChangeKg).toBeNull();
    expect(t.daysSinceLastWeighIn).toBe(16);
  });

  it("says nothing at all with nothing logged", () => {
    const t = weightTrend([], "2026-01-01");
    expect(t.confidence).toBe("none");
    expect(t.trendKg).toBeNull();
    expect(describeTrend(t, kg)).toBe("No weigh-ins yet.");
  });

  it("describes a low-confidence trend without a direction", () => {
    const t = weightTrend([w("2026-01-01", 80), w("2026-01-12", 79)], "2026-01-13");
    const said = describeTrend(t, kg);
    expect(said).toMatch(/too few/);
    expect(said).not.toMatch(/down|up/);
  });

  it("calls a flat week level rather than inventing a direction", () => {
    const flat = Array.from({ length: 14 }, (_, i) =>
      w(`2026-01-${String(i + 1).padStart(2, "0")}`, 80 + (i % 2 === 0 ? 0.3 : -0.3)));
    const t = weightTrend(flat, "2026-01-14");
    expect(describeTrend(t, kg)).toMatch(/level/);
  });
});
