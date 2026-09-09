import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, weighIns } from "@/lib/db/schema";
import { GoalCard } from "@/components/goal-card";
import { runTool } from "@/lib/tools";
import { goalDirection } from "@/lib/nutrition";
import { requireOnboarded } from "@/lib/session";
import {
  burnThisWeek, currentStreak, exerciseProgression, measurementProgress, nutritionTrend,
  trainingTotals, weekReview,
} from "@/lib/progress";
import { kgToLb, lengthLabel, weightLabel, weightOut } from "@/lib/units";
import { Sparkline } from "@/components/sparkline";
import { BurnCard } from "@/components/burn-card";
import { WeighIn } from "@/components/weigh-in";
import { prettyDate, weekStart } from "@/lib/date";
import { weightTrend } from "@/lib/trend";
import { profileToday } from "@/lib/profile";
import { CheckIn } from "@/components/check-in";
import { Progression } from "@/components/progression";
import { AiOpinion } from "@/components/ai-opinion";
import { Measurements } from "@/components/measurements";
import { NutritionTrendCard } from "@/components/nutrition-trend";
import { ProgressPhotos } from "@/components/photos";
import { photoLibrary } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const profile = await requireOnboarded();
  const u = profile.units;
  const unit = weightLabel(u);

  const her = profileToday(profile);

  const [history, milestones, review, streak, sites, library, progression, eating, burn, totals] = await Promise.all([
    db.select().from(weighIns).where(eq(weighIns.profileId, profile.id))
      .orderBy(desc(weighIns.date)).limit(60),
    db.select().from(goals).where(eq(goals.profileId, profile.id)).orderBy(goals.sortOrder, goals.createdAt),
    weekReview(profile.id, u, weekStart(her), her),
    currentStreak(profile.id, her),
    measurementProgress(profile.id, u),
    photoLibrary(profile.id),
    exerciseProgression(profile.id, u, { asOf: her }),
    nutritionTrend(profile.id, 14, her),
    burnThisWeek(profile.id, weekStart(her), profile.startWeightKg ?? 70),
    trainingTotals(profile.id, her),
  ]);

  // The trend, not this morning's reading: a day's weight moves on water,
  // food and where she is in her cycle, and reading that as progress — in
  // either direction — is wrong about half the time.
  const trend = weightTrend(history.map((h) => ({ date: h.date, weightKg: h.weightKg })), her);
  const latest = trend.trendKg ?? history[0]?.weightKg ?? profile.startWeightKg;
  const current = weightOut(latest, u);
  const rawLatest = weightOut(history[0]?.weightKg ?? null, u);
  const weekly = weightOut(trend.weeklyChangeKg, u);
  const start = weightOut(profile.startWeightKg, u);
  const goal = weightOut(profile.goalWeightKg, u);
  // Which way she is going — the one place that decides, not a subtraction
  // done again here. Judged on the trend, like everything else that reads her
  // weight over time.
  const direction = goalDirection(latest ?? profile.startWeightKg ?? 0, profile.goalWeightKg);

  // Accounts that predate the ladder have a goal and no rungs. Built once,
  // here, through the tool — the same shape as the meal panel asking for a
  // recipe the planner left blank: only when there is nothing, so the second
  // open does no work, and never a model call. A "hold" has no rungs by
  // design, so it is not treated as missing.
  let rows = milestones;
  if (direction !== "hold" && !milestones.some((m) => m.source === "auto")) {
    await runTool("set_weight_milestones", {}, { profileId: profile.id });
    rows = await db.select().from(goals).where(eq(goals.profileId, profile.id))
      .orderBy(goals.sortOrder, goals.createdAt);
  }
  const ladder = rows.map((m) => ({
    id: m.id,
    title: m.title,
    target: m.kind === "weight" || m.kind === "strength" ? weightOut(m.targetValue, u) : m.targetValue,
    achieved: m.achievedAt !== null,
    achievedOn: m.achievedAt ? prettyDate(m.achievedAt.toISOString().slice(0, 10)) : null,
    auto: m.source === "auto",
    targetDate: m.targetDate,
  }));
  const lost = start !== null && current !== null ? Math.round((start - current) * 10) / 10 : null;
  const toGo = goal !== null && current !== null ? Math.round((current - goal) * 10) / 10 : null;
  const pct =
    start !== null && goal !== null && current !== null && start !== goal
      ? Math.max(0, Math.min(100, ((start - current) / (start - goal)) * 100))
      : null;

  // Logging a weigh-in is the reason she opens this screen, so it sits above
  // everything — reachable without scrolling.
  const weighedInToday = history[0]?.date === her;

  return (
    <>
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <div className="flex shrink-0 items-center gap-2">
            <AiOpinion page="progress" label="progress" />
          </div>
        </div>

        {/*
          The week's three numbers under the title rather than beside it. On a
          phone they were sharing a row with the coach buttons, which pushed
          them onto three ragged lines and ran the last button off the edge of
          the screen.
        */}
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] text-muted tabular">
          <span>
            <span className="font-semibold text-text">{review.completed}</span>
            <span className="text-faint">/{review.planned || "—"}</span> sessions
          </span>
          <span className="text-line">·</span>
          <span><span className="font-semibold text-text">{review.totalSets}</span> sets</span>
          <span className="text-line">·</span>
          <span><span className="font-semibold text-text">{streak}</span>-day streak</span>
        </p>
      </header>

      {/*
        The trend first, because it is the answer to the question she opened
        this screen with. It used to sit fifth, under a card explaining why
        weighing in matters — above the number that explains it.
      */}
      <section className="card mb-3 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">
              {trend.confidence === "none" ? "Current" : "Trend"}
            </p>
            <p className="text-4xl font-bold tabular">
              {current ?? "—"}<span className="ml-1 text-lg font-medium text-faint">{unit}</span>
            </p>
            {rawLatest !== null && trend.confidence !== "none" && (
              <p className="mt-0.5 text-[12px] text-faint tabular">
                last weigh-in {rawLatest} {unit}
              </p>
            )}
          </div>
          <div className="text-right">
            {lost !== null && lost !== 0 && (
              <p className={`text-lg font-semibold tabular ${lost > 0 ? "text-beat" : "text-muted"}`}>
                {lost > 0 ? "−" : "+"}{Math.abs(lost)} {unit}
              </p>
            )}
            {/* Deliberately silent when the data cannot support a direction:
                a fortnightly weigher would otherwise be told she gained half a
                kilo because she happened to weigh in bloated. */}
            {weekly !== null && (
              <p className="text-[12px] text-muted tabular">
                {weekly === 0 ? "level" : `${weekly < 0 ? "−" : "+"}${Math.abs(weekly)} ${unit}`} this week
              </p>
            )}
            <p className="text-[12px] text-faint">
              {toGo !== null ? `${Math.max(0, toGo)} ${unit} to goal` : "no goal set"}
            </p>
          </div>
        </div>

        {trend.confidence === "low" && trend.weighInsLast14Days > 0 && (
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            {trend.weighInsLast14Days} weigh-in{trend.weighInsLast14Days === 1 ? "" : "s"} in the last
            fortnight — a few more and the trend can say which way it&rsquo;s going.
          </p>
        )}

        {pct !== null && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="mt-4">
          <Sparkline
            points={[...history].reverse().map((h) => weightOut(h.weightKg, u)!)}
            trend={trend.series.map((p) => weightOut(p.trend, u)!)}
            goal={goal}
          />
        </div>
      </section>
      <WeighIn current={current} unit={unit} loggedToday={weighedInToday} />

      {/*
        The week's detail and the milestones, beside the numbers rather than
        under them. Both were cards of their own and both were mostly one line
        — "still to do this week" and "no milestones yet" do not each need a
        heading, a border, and a screenful of scroll between them.
      */}
      <GoalCard
        goal={goal}
        current={current}
        start={start}
        unit={unit}
        goalDate={profile.goalDate}
        direction={direction}
        rungs={ladder}
      />

      {/* Everything she has ever lifted, added up. The one number that only
          ever goes up — the session-done screen shows it for one workout;
          this is all of them, and it is pure confidence. */}
      {totals.sessions > 0 && (
        <section className="card mb-3 overflow-hidden p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-beat">Lifted, all time</p>
          <p className="mt-1 text-4xl font-bold tabular tracking-tight">
            {(u === "imperial" ? Math.round(kgToLb(totals.volumeKg)) : Math.round(totals.volumeKg)).toLocaleString()}
            <span className="ml-1.5 text-lg font-semibold text-muted">{unit}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">
            across {totals.sessions.toLocaleString()} session{totals.sessions === 1 ? "" : "s"} and{" "}
            {totals.sets.toLocaleString()} set{totals.sets === 1 ? "" : "s"}
            {totals.thisWeekVolumeKg > 0 && (
              <> · <span className="text-beat">{(u === "imperial" ? Math.round(kgToLb(totals.thisWeekVolumeKg)) : Math.round(totals.thisWeekVolumeKg)).toLocaleString()} {unit}</span> this week</>
            )}
          </p>
        </section>
      )}

      <section className="card mb-3 p-5">
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">This week</h2>
          {/* What is left, first: after finishing Tuesday's session this
              said "still to do: Monday" and nothing at all about the two
              sessions ahead of her. */}
          {review.remainingDays.length > 0 && (
            <p className="mb-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[13px] text-accent">
              Left this week: {review.remainingDays.join(", ")}
            </p>
          )}
          {review.missedDays.length > 0 && (
            <p className="mb-2 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2 text-[13px] text-hold">
              {review.weekOver ? "Not done last week" : "Missed so far"}: {review.missedDays.join(", ")}
            </p>
          )}
          {review.remainingDays.length === 0 && review.missedDays.length === 0 && review.planned > 0 && (
            <p className="mb-2 rounded-xl border border-beat/30 bg-beat-soft px-3 py-2 text-[13px] text-beat">
              Every session this week, done.
            </p>
          )}
          {review.beat.length > 0 && <List tone="beat" title="Moved up" items={review.beat} />}
          {review.missed.length > 0 && <List tone="miss" title="Came up short" items={review.missed} />}
          {review.beat.length === 0 && review.missed.length === 0 && review.missedDays.length === 0 && (
            <p className="text-[13px] text-faint">Log some sets and this fills in.</p>
          )}
        </div>

      </section>


      {/*
        Two explicit columns on a desktop, not a flowed one.
        A multi-column *flow* reshuffles everything below the cursor when a
        card expands — and half of these expand. Two independent columns only
        ever move their own contents, so opening the measurement form pushes
        the photos down and leaves the left-hand side alone.

        Left is what she came to look at; right is what she came to do.
      */}
      <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-4">
      <div>
      <div className="mb-3">
        <BurnCard
          title="Training cost this week"
          kcal={burn.total}
          sub="this week"
          sessions={burn.sessions}
        />
      </div>

      <NutritionTrendCard trend={eating} />
      <Progression items={progression} unit={weightLabel(u)} />



      </div>

      <div>
      <Measurements sites={sites} unit={lengthLabel(u)} />
      <ProgressPhotos photos={library.photos} total={library.total} />
      {/* Last, because it is the one thing here that cannot say anything
          useful until several weeks of logs exist — and until it can, it is a
          card explaining why it has nothing to say. */}
      <CheckIn />

      </div>
      </div>
    </>
  );
}


const List = ({ tone, title, items }: { tone: "beat" | "miss"; title: string; items: string[] }) => (
  <div className="mt-3">
    <p className={`mb-1.5 text-[11px] uppercase tracking-wide ${tone === "beat" ? "text-beat" : "text-miss"}`}>
      {title}
    </p>
    <ul className="space-y-1">
      {items.map((t, i) => <li key={i} className="text-[13px] text-muted">{t}</li>)}
    </ul>
  </div>
);
