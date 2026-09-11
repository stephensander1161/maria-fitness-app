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
import { addDays, prettyDate, weekStart } from "@/lib/date";
import Link from "next/link";
import { DayStep } from "@/components/day-nav";
import { weightTrend } from "@/lib/trend";
import { profileToday } from "@/lib/profile";
import { CheckIn } from "@/components/check-in";
import { Progression } from "@/components/progression";
import { Measurements } from "@/components/measurements";
import { NutritionTrendCard } from "@/components/nutrition-trend";
import { ProgressPhotos } from "@/components/photos";
import { photoLibrary } from "@/lib/photos";
import { dayFoodView } from "@/lib/views";
import { MacroBars } from "@/components/macro-bars";
import { type MacroRow } from "@/lib/macro-progress";
import { Headline, ProgressSection } from "@/components/progress-section";
import { SleepCard } from "@/components/sleep-card";
import { SleepTrend } from "@/components/sleep-trend";
import { formatSleep, sleepTarget, sleepTotals } from "@/lib/sleep";

export const dynamic = "force-dynamic";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const profile = await requireOnboarded();
  const u = profile.units;
  const unit = weightLabel(u);

  const today = profileToday(profile);
  /*
    The day the whole screen is read as of.

    Every horizon on this page is relative to a day — today, this week, this
    month — so moving the date moves all four together rather than leaving
    "Today" showing Thursday above a week that still ends on Friday. Same
    `?d=` as Train and Eat, validated the same way.
  */
  const { d } = await searchParams;
  const her = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? (d as typeof today) : today;
  const isToday = her === today;
  // One target for every sleep figure on the screen, hers or the default.
  const target = sleepTarget(profile);

  const [history, milestones, review, streak, sites, library, progression, eating, burn, totals, food, sleep] = await Promise.all([
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
    dayFoodView(profile.id, her),
    sleepTotals(profile.id, her),
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

  const monthName = new Date(`${her}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const lb = (kg: number) => (u === "imperial" ? Math.round(kgToLb(kg)) : Math.round(kg)).toLocaleString();

  /** Today's four food numbers, judged in the one place — see MacroBars. */
  const macroRows: MacroRow[] = [
    { key: "calories", label: "Calories", value: food.calories, target: food.calorieTarget, complete: food.caloriesComplete, suffix: "" },
    { key: "protein", label: "Protein", value: food.proteinG, target: food.proteinTargetG, complete: food.caloriesComplete, suffix: "g" },
    { key: "carbs", label: "Carbs", value: food.carbsG, target: food.carbTargetG, complete: food.carbsComplete, suffix: "g" },
    { key: "fat", label: "Fat", value: food.fatG, target: food.fatTargetG, complete: food.fatComplete, suffix: "g" },
  ];

  return (
    <>
      <header className="mb-5">
        <div className="flex items-center gap-1">
          <DayStep href={`/progress?d=${addDays(her, -1)}`} dir="left" label="The day before" />
          <h1 className="min-w-0 flex-1 truncate text-center text-2xl font-bold tracking-tight md:text-left">
            Progress
          </h1>
          {/* The way back, only when she is not on it. */}
          {!isToday && (
            <Link href="/progress" scroll={false} className="shrink-0 px-2 text-[12px] text-accent">
              Today
            </Link>
          )}
          <DayStep href={`/progress?d=${addDays(her, 1)}`} dir="right" label="The day after" />
        </div>

        {/* Which day the four horizons below are read as of. Stated rather
            than implied: "Today" over Thursday's numbers is the kind of wrong
            that is only noticed after it has been believed. */}
        {!isToday && (
          <p className="mt-1 text-[12px] text-accent">As of {prettyDate(her)}</p>
        )}

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
        Four horizons, ascending: today, this week, this month, this year.

        This was one column of cards in the order they were built, so this
        morning's weigh-in, last week's missed sessions and a lifetime volume
        total sat against each other with nothing to say which was which. They
        are different sizes of true and the question is asked at four
        different sizes — "how am I doing right now" and "how am I doing
        overall" want different answers.

        Ascending, not descending. What she can still act on today is at the
        top where it needs no scroll; the long view rewards a scroll rather
        than demanding one.
      */}
      <ProgressSection title={isToday ? "Today" : "That day"} hint={prettyDate(her)}>
        {/*
          The trend first, because it is the question she opened the screen
          with. It used to sit fifth, under a card explaining why weighing in
          matters — above the number that explains it.
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
                  a fortnightly weigher would otherwise be told she gained half
                  a kilo because she happened to weigh in bloated. */}
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

        <WeighIn current={current} unit={unit} loggedToday={weighedInToday} tone={profile.coachTone} />

        {/* Directly under the weigh-in: both are a number she gives the app
            first thing, and between them they explain most of a bad week. */}
        <SleepCard
          tone={profile.coachTone}
          lastNight={sleep.lastNight ? formatSleep(sleep.lastNight.minutes) : null}
          target={formatSleep(target)}
          quality={sleep.lastNight?.quality ?? null}
        />

        {/* What she has eaten so far, on the same terms as the Eat screen: a
            total built from entries that carry no figures is a floor, and gets
            a bar with no verdict rather than a colour it has not earned. */}
        {(food.logged.length > 0 || food.calorieTarget !== null) && (
          <section className="card mb-3 p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Food today</p>
            <MacroBars rows={macroRows} />
          </section>
        )}

        {/* And what she has lifted since this morning — the one training
            number still hers to change today. */}
        {totals.todaySets > 0 && (
          <section className="card mb-3 flex items-end justify-between gap-4 p-5">
            <Headline value={lb(totals.todayVolumeKg)} unit={unit} label="lifted today" tone="good" />
            <Headline value={String(totals.todaySets)} label={`set${totals.todaySets === 1 ? "" : "s"} logged`} />
          </section>
        )}
      </ProgressSection>

      <ProgressSection title="This week" hint={`week of ${prettyDate(weekStart(her))}`}>
        <section className="card mb-3 p-5">
          {/* What is left, first: after finishing Tuesday's session this said
              "still to do: Monday" and nothing at all about the two sessions
              ahead of her. */}
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
          {totals.thisWeekVolumeKg > 0 && (
            <div className="mb-1 flex items-end justify-between gap-4 border-b border-line/60 pb-3">
              <Headline value={lb(totals.thisWeekVolumeKg)} unit={unit} label="lifted this week" tone="good" />
              <Headline
                value={String(totals.thisWeekSessions)}
                label={`session${totals.thisWeekSessions === 1 ? "" : "s"}`}
              />
            </div>
          )}
          {review.beat.length > 0 && <List tone="beat" title="Moved up" items={review.beat} />}
          {review.missed.length > 0 && <List tone="miss" title="Came up short" items={review.missed} />}
          {review.beat.length === 0 && review.missed.length === 0 && review.missedDays.length === 0 && (
            <p className="text-[13px] text-faint">Log some sets and this fills in.</p>
          )}
        </section>

        <div className="mb-3">
          <BurnCard
            title="Training cost this week"
            kcal={burn.total}
            sub="this week"
            sessions={burn.sessions}
          />
        </div>

        <NutritionTrendCard trend={eating} />
        <SleepTrend window={sleep.week} label="slept a night this week" target={target} />
      </ProgressSection>

      {/*
        A month is where a body composition change is finally louder than the
        noise — a fortnight of weight is mostly water, and a tape measure moves
        on a scale of weeks rather than days. So the measurements live here
        rather than beside this morning's weigh-in.
      */}
      <ProgressSection title="This month" hint={monthName}>
        {totals.thisMonthSessions > 0 && (
          <section className="card mb-3 flex flex-wrap items-end justify-between gap-4 p-5">
            <Headline value={lb(totals.thisMonthVolumeKg)} unit={unit} label="lifted this month" tone="good" />
            <Headline
              value={String(totals.thisMonthSessions)}
              label={`session${totals.thisMonthSessions === 1 ? "" : "s"} this month`}
            />
          </section>
        )}
        <Measurements sites={sites} unit={lengthLabel(u)} />
        <Progression items={progression} unit={weightLabel(u)} />
        <SleepTrend window={sleep.month} label="slept a night this month" target={target} />
      </ProgressSection>

      {/*
        The long view. Everything here only ever goes up, which is the point:
        a bad fortnight cannot take a session off the lifetime count, and this
        is the section to scroll to on the day the week has gone badly.
      */}
      <ProgressSection title="This year and all time" hint={her.slice(0, 4)}>
        {totals.sessions > 0 && (
          <section className="card mb-3 overflow-hidden p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-beat">Lifted, all time</p>
            <p className="mt-1 text-4xl font-bold tabular tracking-tight">
              {lb(totals.volumeKg)}
              <span className="ml-1.5 text-lg font-semibold text-muted">{unit}</span>
            </p>
            <p className="mt-1 text-[13px] text-muted">
              across {totals.sessions.toLocaleString()} session{totals.sessions === 1 ? "" : "s"} and{" "}
              {totals.sets.toLocaleString()} set{totals.sets === 1 ? "" : "s"}
            </p>
            {totals.thisYearSessions > 0 && (
              <p className="mt-2 border-t border-line/60 pt-2 text-[13px] text-muted">
                <span className="text-beat">{lb(totals.thisYearVolumeKg)} {unit}</span> and{" "}
                {totals.thisYearSessions.toLocaleString()} session
                {totals.thisYearSessions === 1 ? "" : "s"} this year
              </p>
            )}
          </section>
        )}

        {/* The milestones: the one thing on this screen that is explicitly
            about where she is going rather than where she has been. */}
        <GoalCard
          goal={goal}
          current={current}
          start={start}
          unit={unit}
          goalDate={profile.goalDate}
          direction={direction}
          rungs={ladder}
        />

        <ProgressPhotos photos={library.photos} total={library.total} />

        {/* Last, because it is the one thing here that cannot say anything
            useful until several weeks of logs exist — and until it can, it is
            a card explaining why it has nothing to say. */}
        <CheckIn />
      </ProgressSection>
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
