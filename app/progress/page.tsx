import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, weighIns } from "@/lib/db/schema";
import { getProfile } from "@/lib/profile";
import { currentStreak, weekReview } from "@/lib/progress";
import { weightLabel, weightOut } from "@/lib/units";
import { Sparkline } from "@/components/sparkline";
import { WeighIn } from "@/components/weigh-in";
import { prettyDate } from "@/lib/date";
import { SignOut } from "@/components/sign-out";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const profile = await getProfile();
  const u = profile.units;
  const unit = weightLabel(u);

  const [history, milestones, review, streak] = await Promise.all([
    db.select().from(weighIns).where(eq(weighIns.profileId, profile.id))
      .orderBy(desc(weighIns.date)).limit(60),
    db.select().from(goals).where(eq(goals.profileId, profile.id)).orderBy(goals.sortOrder, goals.createdAt),
    weekReview(profile.id),
    currentStreak(profile.id),
  ]);

  const latest = history[0]?.weightKg ?? profile.startWeightKg;
  const current = weightOut(latest, u);
  const start = weightOut(profile.startWeightKg, u);
  const goal = weightOut(profile.goalWeightKg, u);
  const lost = start !== null && current !== null ? Math.round((start - current) * 10) / 10 : null;
  const toGo = goal !== null && current !== null ? Math.round((current - goal) * 10) / 10 : null;
  const pct =
    start !== null && goal !== null && current !== null && start !== goal
      ? Math.max(0, Math.min(100, ((start - current) / (start - goal)) * 100))
      : null;

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Progress</h1>

      <section className="card mb-3 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">Current</p>
            <p className="text-4xl font-bold tabular">
              {current ?? "—"}<span className="ml-1 text-lg font-medium text-faint">{unit}</span>
            </p>
          </div>
          <div className="text-right">
            {lost !== null && lost !== 0 && (
              <p className={`text-lg font-semibold tabular ${lost > 0 ? "text-beat" : "text-muted"}`}>
                {lost > 0 ? "−" : "+"}{Math.abs(lost)} {unit}
              </p>
            )}
            <p className="text-[12px] text-faint">
              {toGo !== null ? `${Math.max(0, toGo)} ${unit} to goal` : "no goal set"}
            </p>
          </div>
        </div>

        {pct !== null && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="mt-4">
          <Sparkline points={[...history].reverse().map((h) => weightOut(h.weightKg, u)!)} goal={goal} />
        </div>

        <div className="mt-3">
          <WeighIn current={current} unit={unit} />
        </div>
      </section>

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
            Still to do this week: {review.missedDays.join(", ")}
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
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                  m.achievedAt ? "border-beat bg-beat text-ink" : "border-line text-transparent"
                }`}>✓</span>
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
