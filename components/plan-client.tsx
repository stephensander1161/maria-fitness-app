"use client";

import { useState } from "react";
import Link from "next/link";
import type { DayFoodView, MealWeekView, WeekView } from "@/lib/views";
import { CalorieCalculator } from "./calorie-calculator";
import { TodayFood } from "./today-food";

export function PlanClient({ week, mealWeek, dayFood }: {
  week: WeekView; mealWeek: MealWeekView; dayFood: DayFoodView;
}) {
  const [tab, setTab] = useState<"training" | "meals">("training");
  const [openDay, setOpenDay] = useState<number | null>(week.todayIndex);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
        {(["training", "meals"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full py-2 text-[13px] font-medium capitalize transition-colors ${
              tab === t ? "bg-accent text-ink" : "text-muted"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "training" ? (
        week.exists ? (
          <div className="space-y-2">
            {week.rationale && (
              <p className="card mb-3 p-4 text-[13px] leading-relaxed text-muted">{week.rationale}</p>
            )}
            {week.days.map((d) => (
              <DayRow
                key={d.dayOfWeek}
                open={openDay === d.dayOfWeek}
                onToggle={() => setOpenDay(openDay === d.dayOfWeek ? null : d.dayOfWeek)}
                isToday={d.dayOfWeek === week.todayIndex}
                dayName={d.dayName}
                title={d.title}
                meta={d.isRest ? "Rest" : `${d.exercises.length} exercises`}
                dim={d.isRest}
              >
                {d.notes && <p className="mb-2 text-[13px] italic text-faint">{d.notes}</p>}
                {d.exercises.map((e) => (
                  <Link key={e.slug} href={`/learn/${e.slug}`}
                    className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2.5 last:border-0">
                    <span className="text-[15px]">{e.name}</span>
                    <span className="shrink-0 text-[13px] text-muted tabular">{e.target}</span>
                  </Link>
                ))}
              </DayRow>
            ))}
          </div>
        ) : (
          <Empty body="No training plan for this week yet. Ask your coach to build one." />
        )
      ) : mealWeek.exists ? (
        <div className="space-y-2">
          <TodayFood day={dayFood} />
          <CalorieCalculator calorieTarget={mealWeek.calorieTarget} />

          <div className="card mb-3 flex divide-x divide-line p-4">
            <Stat label="Daily calories" value={mealWeek.calorieTarget.toString()} />
            <Stat label="Protein" value={`${mealWeek.proteinTargetG}g`} />
          </div>
          {mealWeek.rationale && (
            <p className="card mb-3 p-4 text-[13px] leading-relaxed text-muted">{mealWeek.rationale}</p>
          )}
          {mealWeek.days.map((d) => (
            <DayRow
              key={d.dayOfWeek}
              open={openDay === d.dayOfWeek}
              onToggle={() => setOpenDay(openDay === d.dayOfWeek ? null : d.dayOfWeek)}
              isToday={d.dayOfWeek === mealWeek.todayIndex}
              dayName={d.dayName}
              title={d.meals.length ? `${d.calories} kcal` : "Nothing planned"}
              meta={d.meals.length ? `${d.proteinG}g protein` : ""}
              dim={d.meals.length === 0}
            >
              {d.meals.map((m) => <MealRow key={m.id} meal={m} />)}
            </DayRow>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <TodayFood day={dayFood} />
          <CalorieCalculator calorieTarget={null} />
          <Empty body="No meal plan for this week yet. Ask your coach to put one together." />
        </div>
      )}
    </>
  );
}

function MealRow({ meal }: { meal: MealWeekView["days"][number]["meals"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/60 py-2.5 last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="mr-2 text-[11px] uppercase tracking-wide text-accent">{meal.slot}</span>
          <span className="text-[15px]">{meal.title}</span>
        </span>
        <span className="shrink-0 text-[13px] text-muted tabular">{meal.calories} · {meal.proteinG}g</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[13px] text-muted">
          {meal.prepMinutes !== null && <p className="text-faint">{meal.prepMinutes} min prep</p>}
          {meal.ingredients.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Ingredients</p>
              <ul className="space-y-0.5">{meal.ingredients.map((x, i) => <li key={i}>· {x}</li>)}</ul>
            </div>
          )}
          {meal.steps.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Method</p>
              <ol className="space-y-1">
                {meal.steps.map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent tabular">{i + 1}.</span><span>{x}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DayRow({
  open, onToggle, isToday, dayName, title, meta, dim, children,
}: {
  open: boolean; onToggle: () => void; isToday: boolean;
  dayName: string; title: string; meta: string; dim?: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`card overflow-hidden ${isToday ? "border-accent/50" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className={`w-11 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-accent" : "text-faint"}`}>
          {dayName.slice(0, 3)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-medium ${dim ? "text-muted" : ""}`}>{title}</p>
          {meta && <p className="text-[12px] text-faint">{meta}</p>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-line px-4 py-2">{children}</div>}
    </section>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex-1 px-4 first:pl-0 last:pr-0">
    <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
    <p className="text-xl font-semibold tabular">{value}</p>
  </div>
);

const Empty = ({ body }: { body: string }) => (
  <div className="card mt-6 p-8 text-center">
    <p className="mx-auto max-w-xs text-sm text-muted">{body}</p>
    <Link href="/" className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink">
      Talk to your coach
    </Link>
  </div>
);
