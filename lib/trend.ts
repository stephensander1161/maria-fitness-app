/**
 * Trend weight: the signal under the noise.
 *
 * A day's weight is body mass plus water, glycogen, gut contents and — for
 * her specifically — a luteal fluid shift that can put 1.5kg on the scale for
 * a week and take it off again. Reading any of that as fat lost or gained is
 * wrong in both directions, and wrong in the direction that reads as *her*
 * failure about half the time.
 *
 * So everything that talks about her weight over time talks about the trend:
 * an exponentially weighted moving average, α derived from the gap between
 * weigh-ins rather than fixed, so a week off does not let a stale number keep
 * its full weight. Ten-day half-life — long enough to swallow a fluid swing,
 * short enough to move within a fortnight.
 *
 * The other half of the job is refusing to answer. Two weigh-ins a month apart
 * have a trend line through them, and it means nothing; `confidence` says so,
 * and callers must not state a weekly change when it is "low".
 */

import type { ISODate } from "./date";

export type WeighIn = { date: ISODate; weightKg: number };
export type TrendPoint = { date: ISODate; raw: number; trend: number };

const DAY = 24 * 60 * 60 * 1000;
const dayGap = (a: ISODate, b: ISODate) =>
  Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY));

/** Ten days to close half the gap to the raw value. */
export const HALF_LIFE_DAYS = 10;

/**
 * Trend value at each weigh-in, oldest first.
 *
 * Time-aware: after a fortnight away the next reading counts for much more
 * than the one before it, which is what stops a month-old number anchoring a
 * line she is reading today.
 */
export function trendSeries(points: WeighIn[], halfLife = HALF_LIFE_DAYS): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let last: ISODate | null = null;

  for (const p of sorted) {
    if (trend === null || last === null) {
      trend = p.weightKg;
    } else {
      const gap = Math.max(1, dayGap(last, p.date));
      const alpha = 1 - Math.pow(0.5, gap / halfLife);
      trend = trend + alpha * (p.weightKg - trend);
    }
    last = p.date;
    out.push({ date: p.date, raw: p.weightKg, trend: Math.round(trend * 100) / 100 });
  }
  return out;
}

export type WeightTrend = {
  /** Null when there is nothing to average at all. */
  trendKg: number | null;
  latestRawKg: number | null;
  latestDate: ISODate | null;
  /** Trend now minus trend a week ago. Null unless the data supports it. */
  weeklyChangeKg: number | null;
  weighInsLast14Days: number;
  daysSinceLastWeighIn: number | null;
  /**
   * high  — 5+ weigh-ins in the last fortnight and one in the last 3 days
   * low   — some data, not enough to state a rate of change
   * none  — nothing logged
   */
  confidence: "high" | "low" | "none";
  series: TrendPoint[];
};

/**
 * The trend, and an honest account of how much it can be trusted.
 *
 * `asOf` is her today, not the server's — a user ahead of the server would
 * otherwise be told her weigh-in from this morning is "1 day ago".
 */
export function weightTrend(points: WeighIn[], asOf: ISODate): WeightTrend {
  const series = trendSeries(points);
  if (series.length === 0) {
    return {
      trendKg: null, latestRawKg: null, latestDate: null, weeklyChangeKg: null,
      weighInsLast14Days: 0, daysSinceLastWeighIn: null, confidence: "none", series,
    };
  }

  const latest = series[series.length - 1];
  const recent = series.filter((p) => dayGap(p.date, asOf) <= 14).length;
  const sinceLast = dayGap(latest.date, asOf);

  // A week ago, by the trend line: the nearest point at least 5 days back, so
  // "this week" is not two readings from the same morning.
  const weekAgo = [...series].reverse().find((p) => dayGap(p.date, latest.date) >= 5);
  const spansAWeek = weekAgo !== undefined;

  // Five readings in a fortnight and one this week. Below that the line is
  // drawn through too little to state a rate from.
  const confidence: WeightTrend["confidence"] =
    recent >= 5 && sinceLast <= 3 && spansAWeek ? "high" : "low";

  return {
    trendKg: latest.trend,
    latestRawKg: latest.raw,
    latestDate: latest.date,
    // Deliberately null when confidence is low: a number here gets read as a
    // fact about her body, and a fortnightly weigher would be told she gained
    // half a kilo because she happened to weigh in bloated.
    weeklyChangeKg:
      confidence === "high" && weekAgo
        ? Math.round((latest.trend - weekAgo.trend) * 100) / 100
        : null,
    weighInsLast14Days: recent,
    daysSinceLastWeighIn: sinceLast,
    confidence,
    series,
  };
}

/** What to say about a trend, in her units, without overstating it. */
export function describeTrend(
  t: WeightTrend,
  format: (kg: number) => string,
): string {
  if (t.confidence === "none") return "No weigh-ins yet.";
  if (t.confidence === "low") {
    return `Trend ${format(t.trendKg!)} — from ${t.weighInsLast14Days} weigh-in${
      t.weighInsLast14Days === 1 ? "" : "s"
    } in the last fortnight, which is too few to say which way it is going.`;
  }
  const change = t.weeklyChangeKg!;
  if (Math.abs(change) < 0.1) return `Trend ${format(t.trendKg!)} — level over the last week.`;
  return `Trend ${format(t.trendKg!)} — ${change < 0 ? "down" : "up"} ${format(Math.abs(change))} over the last week.`;
}
