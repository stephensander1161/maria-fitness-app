"use client";

import Link from "next/link";
import type { MealWeekView, PickableExercise, TodayView, WeekView } from "@/lib/views";
import { MealRow } from "./meal-row";
import { AskCoach } from "./ask-coach";
import { PlannedDay } from "./planned-day";
import { TrainClient, type NextTarget } from "./train-client";

/**
 * The week, as a week.
 *
 * Two things changed here. Training and food no longer sit side by side: a
 * fortnight of testing said nobody reads "what am I training on Thursday" and
 * "what am I eating on Thursday" at the same moment, and the split column gave
 * each of them half a screen to do it in. One at a time, with the whole width.
 *
 * And the days are a row you scan rather than seven cards you unfold. A plan
 * is a calendar; the question it answers is "where am I in the week", and an
 * accordion answers that only after you have counted the rows. Today is marked
 * and selected on arrival, because that is the day she is standing in.
 */
export function PlanClient({
  week, mealWeek, tab, day, today, otherDay, pickable, targets,
}: {
  week: WeekView; mealWeek: MealWeekView;
  tab: "training" | "food";
  day: number;
  today: TodayView;
  /** The selected day, when it is not today. */
  otherDay: TodayView;
  pickable: { group: string; items: PickableExercise[] }[];
  targets: NextTarget[];
}) {
  const isToday = day === week.todayIndex;
  const href = (next: { tab?: string; day?: number }) =>
    `/plan?tab=${next.tab ?? tab}&day=${next.day ?? day}`;

  const trainingDay = week.days.find((d) => d.dayOfWeek === day) ?? null;
  const foodDay = mealWeek.days.find((d) => d.dayOfWeek === day) ?? null;

  return (
    <>
      {/*
        An underline, not two pills inside a bigger pill. And Links, so the
        back button does what it looks like it does and a day is something she
        can send someone.
      */}
      <div className="mb-4 flex gap-6 border-b border-line">
        {(["training", "food"] as const).map((t) => (
          <Link
            key={t}
            href={href({ tab: t })}
            scroll={false}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-[14px] font-medium capitalize transition-colors ${
              tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      <WeekStrip
        days={week.days.map((d) => {
          const food = mealWeek.days.find((m) => m.dayOfWeek === d.dayOfWeek);
          return {
            dayOfWeek: d.dayOfWeek,
            dayName: d.dayName,
            // What the chip has to say at a glance depends on which week she
            // is reading — the training one or the eating one.
            note: tab === "training"
              ? (d.isRest ? "Rest" : `${d.exercises.length}`)
              : (food && food.meals.length > 0 ? `${food.calories}` : "—"),
            quiet: tab === "training" ? d.isRest : !food || food.meals.length === 0,
          };
        })}
        today={week.todayIndex}
        selected={day}
        href={(d) => href({ day: d })}
      />

      {tab === "training" ? (
        week.exists ? (
          <div className="space-y-3">
            <section className="card p-4">
              <DayHeading
                name={trainingDay?.dayName ?? ""}
                isToday={isToday}
                title={trainingDay?.isRest ? "Rest day" : trainingDay?.title ?? "Nothing planned"}
                sub={trainingDay?.focus ?? null}
              />
              {trainingDay?.notes && (
                <p className="mb-2 text-[13px] italic text-faint">{trainingDay.notes}</p>
              )}
              {/*
                Another day of the week is a plan she can edit. Today is a
                session she is in the middle of — so today gets the Train
                screen's own cards rather than a list of names that links to
                the library, which is what "click into the movement I just
                did" used to get her.
              */}
              {!isToday && otherDay && (
                <PlannedDay view={otherDay} pickable={pickable} dayOfWeek={day} past={day < week.todayIndex} />
              )}
            </section>

            {isToday && <TrainClient view={today} pickable={pickable} targets={targets} />}

            {week.rationale && (
              <p className="card p-4 text-[13px] leading-relaxed text-muted">{week.rationale}</p>
            )}
          </div>
        ) : (
          <>
            <Empty body="No training plan for this week yet. Ask your coach to build one." />
            <AskCoach
              title="Ask your coach"
              hint="It builds the week here"
              placeholder="Tell your coach what you want…"
              suggestions={[
                "Build my week",
                "I've only got three days this week",
                "Give me something short I can do at home",
              ]}
            />
          </>
        )
      ) : mealWeek.exists ? (
        <div className="space-y-3">
          <section className="card p-4">
            <DayHeading
              name={foodDay?.dayName ?? ""}
              isToday={day === mealWeek.todayIndex}
              title={foodDay && foodDay.meals.length > 0 ? `${foodDay.calories} kcal` : "Nothing planned"}
              sub={foodDay && foodDay.meals.length > 0 ? `${foodDay.proteinG}g protein` : null}
            />
            {foodDay && foodDay.meals.length > 0 ? (
              <div>{foodDay.meals.map((m) => <MealRow key={m.id} meal={m} />)}</div>
            ) : (
              <p className="py-2 text-[13px] leading-relaxed text-faint">
                Nothing planned for this day. Ask your coach for meals, or just log what you eat
                on the Eat screen — a day you eat off-plan is still a logged day.
              </p>
            )}
            {day === mealWeek.todayIndex && (
              <Link href="/eat"
                className="mt-3 block rounded-xl bg-accent py-3 text-center text-[14px] font-semibold text-ink">
                Log today&rsquo;s food
              </Link>
            )}
          </section>

          <div className="card flex divide-x divide-line p-4">
            <Stat label="Daily calories" value={mealWeek.calorieTarget.toString()} />
            <Stat label="Protein" value={`${mealWeek.proteinTargetG}g`} />
          </div>

          {mealWeek.rationale && (
            <p className="card p-4 text-[13px] leading-relaxed text-muted">{mealWeek.rationale}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Empty body="No meal plan for this week yet. Ask your coach to put one together." />
          <AskCoach
            title="Ask your coach"
            hint="It writes the week here"
            placeholder="Tell your coach what you want…"
            suggestions={[
              "Plan my meals for this week",
              "Keep it simple, I don't want to cook much",
              "What should I eat today?",
            ]}
          />
        </div>
      )}
    </>
  );
}

/**
 * Seven days in a row, with today marked.
 *
 * Scrolls on a narrow phone rather than shrinking to seven unreadable slivers,
 * and each chip carries the one number that makes the week legible at a
 * glance — how many movements, or how many calories.
 */
function WeekStrip({
  days, today, selected, href,
}: {
  days: { dayOfWeek: number; dayName: string; note: string; quiet: boolean }[];
  today: number;
  selected: number;
  href: (day: number) => string;
}) {
  return (
    /* Scrolls only where it has to. At md it is a seven-column grid that
       fits, and leaving the overflow on painted a scrollbar under the header
       for a row that never moves. */
    <div className="mb-4 -mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-x-visible md:px-0">
      <div className="flex gap-2 md:grid md:grid-cols-7">
        {days.map((d) => {
          const isToday = d.dayOfWeek === today;
          const isOn = d.dayOfWeek === selected;
          return (
            <Link
              key={d.dayOfWeek}
              href={href(d.dayOfWeek)}
              scroll={false}
              aria-current={isOn ? "page" : undefined}
              aria-label={`${d.dayName}${isToday ? ", today" : ""}`}
              className={`min-w-[3.5rem] flex-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                isOn ? "border-accent bg-accent-soft" : "border-edge bg-surface hover:bg-raised"
              }`}
            >
              <span className={`block text-[10px] font-semibold uppercase tracking-wide ${
                isToday ? "text-accent" : "text-faint"
              }`}>
                {isToday ? "Today" : d.dayName.slice(0, 3)}
              </span>
              <span className={`mt-1 block text-[15px] font-semibold tabular ${
                d.quiet ? "text-faint" : isOn ? "text-accent" : "text-text"
              }`}>
                {d.note}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DayHeading({
  name, isToday, title, sub,
}: { name: string; isToday: boolean; title: string; sub: string | null }) {
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
        {isToday ? `Today · ${name}` : name}
      </p>
      <h2 className="mt-0.5 text-[17px] font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex-1 px-4 first:pl-0 last:pr-0">
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <p className="text-xl font-semibold tabular">{value}</p>
  </div>
);

const Empty = ({ body }: { body: string }) => (
  <div className="card mt-6 mb-3 p-8 text-center">
    <p className="mx-auto max-w-xs text-sm text-muted">{body}</p>
  </div>
);
