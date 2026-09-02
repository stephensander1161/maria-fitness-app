import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, weighIns } from "@/lib/db/schema";
import { requireOnboarded } from "@/lib/session";
import {
  currentStreak, exerciseProgression, measurementProgress, nutritionTrend, weekReview,
} from "@/lib/progress";
import { lengthLabel, weightLabel, weightOut } from "@/lib/units";
import { Sparkline } from "@/components/sparkline";
import { WeighIn } from "@/components/weigh-in";
import { prettyDate, weekStart } from "@/lib/date";
import { weightTrend } from "@/lib/trend";
import { profileToday } from "@/lib/profile";
import { SignOut } from "@/components/sign-out";
import { CoachBudget, type Usage } from "@/components/coach-budget";
import { UnitsSettings } from "@/components/units-settings";
import { CoachTone } from "@/components/coach-tone";
import { PlanSetupButton } from "@/components/plan-setup";
import { CheckIn } from "@/components/check-in";
import { TranscriptExport } from "@/components/transcript-export";
import { Progression } from "@/components/progression";
import { AiOpinion } from "@/components/ai-opinion";
import { runTool } from "@/lib/tools";
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

  const [history, milestones, review, streak, sites, library, usage, progression, eating] = await Promise.all([
    db.select().from(weighIns).where(eq(weighIns.profileId, profile.id))
      .orderBy(desc(weighIns.date)).limit(60),
    db.select().from(goals).where(eq(goals.profileId, profile.id)).orderBy(goals.sortOrder, goals.createdAt),
    weekReview(profile.id, u, weekStart(her), her),
    currentStreak(profile.id, her),
    measurementProgress(profile.id, u),
    photoLibrary(profile.id),
    runTool("get_coach_usage", {}, { profileId: profile.id }),
    exerciseProgression(profile.id, u, { asOf: her }),
    nutritionTrend(profile.id, 14, her),
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
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <AiOpinion page="progress" label="progress" />
      </header>

      <WeighIn current={current} unit={unit} loggedToday={weighedInToday} />

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

      <NutritionTrendCard trend={eating} />
      <CheckIn />

      <Measurements sites={sites} unit={lengthLabel(u)} />

      <ProgressPhotos photos={library.photos} total={library.total} />

      <Progression items={progression} unit={weightLabel(u)} />

      <section className="card mb-3 p-5">
        <h2 className="mb-3 text-[15px] font-semibold">This week</h2>
        <div className="mb-4 grid grid-cols-3 divide-x divide-line">
          <Stat label="Sessions" value={`${review.completed}/${review.planned || "—"}`} />
          <Stat label="Sets" value={review.totalSets.toString()} />
          <Stat label="Streak" value={`${streak}d`} />
        </div>

        {review.beat.length > 0 && (
          <List tone="beat" title="Moved up" items={review.beat} />
        )}
        {review.missed.length > 0 && (
          <List tone="miss" title="Came up short" items={review.missed} />
        )}
        {review.missedDays.length > 0 && (
          <p className="mt-3 rounded-xl border border-hold/30 bg-hold-soft px-3 py-2 text-[13px] text-hold">
            {review.weekOver ? "Not done last week" : "Still to do this week"}: {review.missedDays.join(", ")}
          </p>
        )}
        {review.beat.length === 0 && review.missed.length === 0 && review.missedDays.length === 0 && (
          <p className="text-[13px] text-faint">Log some sets and this fills in.</p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-[15px] font-semibold">Milestones</h2>
        {milestones.length === 0 ? (
          <p className="text-[13px] text-faint">
            No milestones yet. Ask your coach to set a few — they make the big goal feel reachable.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                {/* The tick used to render in both states, transparent when
                    unachieved — so a milestone she has not hit announced as
                    "✓ Squat bodyweight". */}
                <span
                  aria-hidden={!m.achievedAt}
                  aria-label={m.achievedAt ? "Achieved" : undefined}
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                    m.achievedAt ? "border-beat bg-beat text-ink" : "border-line text-transparent"
                  }`}
                >
                  {m.achievedAt ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] ${m.achievedAt ? "text-muted line-through" : ""}`}>{m.title}</p>
                  <p className="text-[12px] text-faint">
                    {m.achievedAt
                      ? `Hit ${prettyDate(m.achievedAt.toISOString().slice(0, 10))}`
                      : m.targetDate ? `By ${prettyDate(m.targetDate)}` : m.kind}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlanSetupButton
        defaults={{
          daysPerWeek: profile.daysPerWeek,
          sessionMinutes: profile.sessionMinutes,
          equipment: profile.equipment,
          injuries: profile.injuries,
          dietaryRestrictions: profile.dietaryRestrictions,
          dislikedFoods: profile.dislikedFoods,
          cookingSkill: profile.cookingSkill,
        }}
      />
      <CoachTone tone={profile.coachTone} />
      <UnitsSettings units={u} foodUnits={profile.foodUnits} />
      <TranscriptExport />
      <CoachBudget usage={usage as Usage} />

      <SignOut />
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="px-3 text-center first:pl-0 last:pr-0">
    <p className="text-xl font-semibold tabular">{value}</p>
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
  </div>
);

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
