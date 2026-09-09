"use client";

import Link from "next/link";
import { addDays } from "@/lib/date";
import type { MealWeekView, Pickable, TodayView, WeekView } from "@/lib/views";
import { MealRow } from "./meal-row";
import { AskCoach } from "./ask-coach";
import { DayTitle } from "./day-title";
import { AddMeal } from "./add-meal";
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
  week, mealWeek, tab, day, today, otherDay, otherDate, pickable, targets, shownWeek, thisWeek,
}: {
  week: WeekView; mealWeek: MealWeekView;
  tab: "training" | "food";
  day: number;
  today: TodayView;
  /** The selected day, when it is not today. */
  otherDay: TodayView;
  otherDate: string;
  pickable: Pickable;
  targets: NextTarget[];
  /** The Monday on screen, and the Monday she is actually in. */
  shownWeek: string;
  thisWeek: string;
}) {
  const onThisWeek = shownWeek === thisWeek;
  // "Today" only means today on the week that contains it.
  const isToday = onThisWeek && day === week.todayIndex;
  const href = (next: { tab?: string; day?: number; w?: string }) =>
    `/plan?tab=${next.tab ?? tab}&day=${next.day ?? day}&w=${next.w ?? shownWeek}`;
  const shift = (weeks: number) => {
    const d = new Date(`${shownWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };

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

      {/* A week at a time. The programme repeats by default — an empty week
          inherits the last one — so stepping forward is how she changes a
          single week without redesigning the whole thing. */}
      {/* Arrows, not words: "‹ Previous / Back to this week / Next ›" is
          three text links fighting for one phone row, and the middle one is
          the only one anybody reads. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={href({ w: shift(-1) })}
          scroll={false}
          aria-label="The week before"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        {onThisWeek ? (
          <span className="truncate text-[12px] font-medium uppercase tracking-wide text-faint">
            This week
          </span>
        ) : (
          <Link href={href({ w: thisWeek })} scroll={false}
            className="truncate rounded-lg px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent transition-colors hover:bg-accent-soft">
            Back to today
          </Link>
        )}
        <Link
          href={href({ w: shift(1) })}
          scroll={false}
          aria-label="The week after"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      <WeekStrip
        days={week.days.map((d) => {
          const food = mealWeek.days.find((m) => m.dayOfWeek === d.dayOfWeek);
          return {
            dayOfWeek: d.dayOfWeek,
            dayName: d.dayName,
            // The date, because without it every week looks like every other
            // one. An untouched week inherits the last, so the chips read
            // "5 5 4 4 5 5 Rest" on the week she is on and on the week five
            // ahead of it — she stepped forward and the only thing that moved
            // was a line of small print above.
            date: Number(addDays(shownWeek, d.dayOfWeek).slice(8, 10)),
            // What the chip has to say at a glance depends on which week she
            // is reading — the training one or the eating one.
            note: tab === "training"
              ? (d.isRest ? "Rest" : `${d.exercises.length}`)
              : (food && food.meals.length > 0 ? `${food.calories}` : "—"),
            quiet: tab === "training" ? d.isRest : !food || food.meals.length === 0,
          };
        })}
        today={onThisWeek ? week.todayIndex : -1}
        selected={day}
        href={(d) => href({ day: d })}
      />

      {tab === "training" ? (
        (
          <div className="space-y-3">
            {/*
              The day's name, and — on today — the session clock beside it.
              Start workout used to be a button on a line of its own directly
              under this card, which is two containers saying one thing and a
              whole row of a phone between the name of the session and the
              session. Today hands the heading to TrainClient so the two
              share a container; every other day keeps its own, because there
              is no clock to put in it.
            */}
            {isToday ? (
              <TrainClient
                view={today}
                pickable={pickable}
                targets={targets}
                heading={<DayHeader day={day} trainingDay={trainingDay} exists={week.exists} isToday />}
              />
            ) : (
              <section className="card p-4">
                <DayHeader day={day} trainingDay={trainingDay} exists={week.exists} isToday={false} />
                {/*
                  Another day of the week is a plan she can edit. Today is a
                  session she is in the middle of — so today gets the Train
                  screen's own cards rather than a list of names that links to
                  the library, which is what "click into the movement I just
                  did" used to get her.
                */}
                <TrainClient view={otherDay} pickable={pickable} date={otherDate} isToday={false} />
              </section>
            )}

            {week.rationale && (
              <p className="card p-4 text-[13px] leading-relaxed text-muted">{week.rationale}</p>
            )}

            {/* An option, not the only way in. This used to *replace* the
                whole week when there was no plan — no day switcher, no add
                button, nothing but a button that spends money — which is
                exactly the screen that gets called broken. */}
            {!week.exists && (
              <AskCoach
                title="Or ask your coach"
                hint="It builds the whole week here"
                placeholder="Tell your coach what you want…"
                suggestions={[
                  "Build my week",
                  "I've only got three days this week",
                  "Give me something short I can do at home",
                ]}
              />
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <section className="card p-4">
            <DayHeading
              name={foodDay?.dayName ?? ""}
              isToday={day === mealWeek.todayIndex}
              title={foodDay && foodDay.meals.length > 0 ? `${foodDay.calories} kcal` : "Nothing planned"}
              sub={foodDay && foodDay.meals.length > 0
                ? `${foodDay.proteinG}g protein · ${foodDay.carbsG}g carbs · ${foodDay.fatG}g fat`
                : null}
            />
            {foodDay && foodDay.meals.length > 0 ? (
              <div>{foodDay.meals.map((m) => <MealRow key={m.id} meal={m} dayOfWeek={day} />)}</div>
            ) : (
              <p className="py-2 text-[13px] leading-relaxed text-faint">
                Nothing planned for this day. Ask your coach for meals, or just log what you eat
                on the Eat screen — a day you eat off-plan is still a logged day.
              </p>
            )}
            {/* Add to the day, in the slot she picks — the other half of
                being able to change what is planned. */}
            <AddMeal dayOfWeek={day} />

            {!mealWeek.exists && (
              <AskCoach
                title="Or ask your coach"
                hint="It writes the week's meals here"
                placeholder="Tell your coach what you want…"
                suggestions={[
                  "Plan my meals for the week",
                  "Something quick for weeknights",
                  "High protein, no fish",
                ]}
              />
            )}

            {day === mealWeek.todayIndex && (
              <Link href="/eat"
                className="mt-3 block rounded-xl bg-accent py-3 text-center text-[14px] font-semibold text-on-accent">
                Log today&rsquo;s food
              </Link>
            )}
          </section>

          {mealWeek.calorieTarget > 0 && (
            <div className="card flex divide-x divide-line p-4">
              <Stat label="Daily calories" value={mealWeek.calorieTarget.toString()} />
              <Stat label="Protein" value={`${mealWeek.proteinTargetG}g`} />
            </div>
          )}

          {mealWeek.rationale && (
            <p className="card p-4 text-[13px] leading-relaxed text-muted">{mealWeek.rationale}</p>
          )}
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
/**
 * The day's name and title, in whichever container is hosting it.
 *
 * Editable here as well as on Train. "Full Body B" is the planner's phrasing,
 * and the first thing anyone wants to do with a name a machine chose is
 * change it — which used to work only on the Train screen, and only for today.
 */
function DayHeader({
  day, trainingDay, exists, isToday,
}: {
  day: number;
  trainingDay: WeekView["days"][number] | null;
  exists: boolean;
  isToday: boolean;
}) {
  return (
    <>
      <div>
        {exists && trainingDay && !trainingDay.isRest ? (
          <DayTitle
            title={trainingDay.title}
            dayOfWeek={day}
            focus={trainingDay.focus}
            compact
            prefix={isToday ? `Today · ${trainingDay?.dayName ?? ""}` : trainingDay?.dayName ?? ""}
          />
        ) : (
          <p className="text-[17px] font-semibold md:text-2xl">
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              {isToday ? `Today · ${trainingDay?.dayName ?? ""}` : trainingDay?.dayName ?? ""} ·
            </span>
            {trainingDay?.isRest ? "Rest day" : trainingDay?.title ?? "Nothing planned"}
          </p>
        )}
      </div>
      {trainingDay?.notes && (
        <p className="mt-2 text-[13px] italic text-faint">{trainingDay.notes}</p>
      )}
    </>
  );
}

function WeekStrip({
  days, today, selected, href,
}: {
  days: { dayOfWeek: number; dayName: string; date: number; note: string; quiet: boolean }[];
  today: number;
  selected: number;
  href: (day: number) => string;
}) {
  return (
    /* Seven columns at every width, and no scroller.
       Chips with a minimum width and a scroll fallback ran a few pixels past
       the edge of a phone, which bought a horizontal scrollbar under the tabs
       for a row that has exactly seven things in it and always will. Seven
       equal columns fit on the narrowest screen worth supporting; the type
       and the padding give way instead. */
    <div className="mb-4">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const isToday = d.dayOfWeek === today;
          const isOn = d.dayOfWeek === selected;
          return (
            <Link
              key={d.dayOfWeek}
              href={href(d.dayOfWeek)}
              scroll={false}
              aria-current={isOn ? "page" : undefined}
              aria-label={`${d.dayName} the ${d.date}${isToday ? ", today" : ""}`}
              className={`min-w-0 rounded-xl border px-0.5 py-2 text-center transition-colors sm:px-2 sm:py-2.5 ${
                isOn ? "border-accent bg-accent-soft" : "border-edge bg-surface hover:bg-raised"
              }`}
            >
              {/* "Today" does not fit in a seventh of a phone; the marker
                  does the same job in the space there is. */}
              <span className={`block truncate text-[10px] font-semibold uppercase tracking-tight ${
                isToday ? "text-accent" : "text-faint"
              }`}>
                {d.dayName.slice(0, 3)} {d.date}
                {isToday && <span aria-hidden>·</span>}
                {isToday && <span className="sr-only">, today</span>}
              </span>
              <span className={`mt-0.5 block truncate text-[14px] font-semibold tabular sm:text-[15px] ${
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

