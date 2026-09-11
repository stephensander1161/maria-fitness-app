import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { exercises, profiles } from "@/lib/db/schema";
import {
  currentStreak, exerciseProgression, nutritionTrend, weekReview, measurementProgress,
} from "@/lib/progress";
import { dayFoodView, mealWeekView, todayView, weekView } from "@/lib/views";
import { lengthLabel, weightLabel, weightOut } from "@/lib/units";
import { profileToday } from "@/lib/profile";
import { foodUnitsOf } from "@/lib/food-units";
import { DAY_NAMES, type ISODate, isFuture, prettyDate, weekStart } from "@/lib/date";

export type OpinionPage = "train" | "plan" | "progress";

/**
 * What a screen is actually showing, as text for the coach.
 *
 * Composed on the server, never sent up from the browser — the same rule as the
 * opening greeting. It also saves a handful of tool round trips: the coach is
 * being asked about what is on screen, so hand it exactly that.
 */
export async function buildPageContext(
  profileId: string,
  page: OpinionPage,
  /*
    The day the screen is actually showing.

    Train, Eat and Progress all take a `?d=`, and this read every one of them
    as today — so on Friday, stepped back to Thursday, the coach was handed
    Friday's numbers and answered about Friday. It believes this block
    completely, so being one day out is not a small wrongness: it is the coach
    telling her she has eaten nothing when she is looking at a full day.

    Defaults to her today, and `contextForPath` is the only caller that can
    set it — from a date it has already validated.
  */
  on?: ISODate,
): Promise<string> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) return "No profile.";
  const u = profile.units;
  const unit = weightLabel(u);
  const today = profileToday(profile);
  // A day she cannot be reading. The pages clamp their own, so this is the
  // browser being wrong or lying, and either way today is the honest answer.
  const day = on && !isFuture(on, today) ? on : today;
  const isToday = day === today;
  // Said once, plainly, and said first. Everything below it is that day's.
  const whichDay = isToday
    ? ""
    : `NOTE: she has stepped back to ${prettyDate(day)}. Everything below is that day, ` +
      `NOT today — today is ${prettyDate(today)}. Answer about the day she is looking at, ` +
      `and do not congratulate or worry her about today from these numbers.`;

  if (page === "train") {
    const view = await todayView(profileId, u, day);
    if (!view.hasPlan) {
      return [whichDay, `She is looking at the workout for ${prettyDate(day)}. There is no plan for that week.`]
        .filter(Boolean).join("\n");
    }

    const lines = view.exercises.map((e) => {
      const doneStr = e.loggedToday.length
        ? e.loggedToday.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}${unit}` : ""}`).join(", ")
        : "nothing yet";
      const last = e.lastTime
        ? e.lastTime.sets.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`).join(", ")
        : "no previous session";
      return `- ${e.name}${e.extra ? " (added that day)" : ""}: target ${e.targetSets}×${e.targetReps}` +
        `${e.targetWeight !== null ? ` @ ${e.targetWeight}${unit}` : ""}. ` +
        `Logged ${isToday ? "today" : "that day"}: ${doneStr}. Last time: ${last}.`;
    });

    return [
      whichDay,
      `She is looking at ${isToday ? "TODAY'S WORKOUT" : `THE WORKOUT FOR ${prettyDate(day)}`}` +
        ` — ${view.dayName}, "${view.title}".`,
      view.isRest ? "It is a rest day." : "",
      view.completed ? "She has already signed the session off." : "",
      ...lines,
    ].filter(Boolean).join("\n");
  }

  if (page === "plan") {
    const [week, mealWeek, dayFood] = await Promise.all([
      weekView(profileId, u, weekStart(day), day),
      mealWeekView(profileId, foodUnitsOf(profile), weekStart(day), day),
      dayFoodView(profileId, day),
    ]);
    const training = week.exists
      ? week.days.map((d) =>
          `- ${d.dayName}${d.isRest ? ": rest" : ` (${d.title}): ${d.exercises.map((e) => `${e.name} ${e.target}`).join(", ")}`}`,
        )
      : ["No training plan for this week."];
    const food = mealWeek.exists
      ? [
          `Targets: ${mealWeek.calorieTarget} kcal, ${mealWeek.proteinTargetG}g protein per day.`,
          ...mealWeek.days.map((d) => `- ${d.dayName}: ${d.calories} kcal, ${d.proteinG}g — ${d.meals.map((m) => m.title).join("; ")}`),
        ]
      : ["No meal plan for this week."];

    // What she actually ate, kept separate from what was planned. Without
    // this the coach reads the plan and answers "how am I doing today?" from
    // meals she may never have eaten — planned food reads as eaten food unless
    // you say which is which. It is also the top of the screen she is on.
    const when = isToday ? "so far today" : `on ${prettyDate(day)}`;
    const eaten = dayFood.logged.length
      ? [
          `EATEN ${when} (this is actual intake, not the plan): ${dayFood.calories} kcal` +
            `${dayFood.calorieTarget !== null ? ` of a ${dayFood.calorieTarget} kcal target` : ""}, ` +
            `${dayFood.proteinG}g protein` +
            `${dayFood.proteinTargetG !== null ? ` of ${dayFood.proteinTargetG}g` : ""}.`,
          dayFood.fibreComplete
            ? `Fibre: ${dayFood.fibreG}g of ${dayFood.fibreTargetG}g.`
            : `Fibre: at least ${dayFood.fibreG}g of ${dayFood.fibreTargetG}g — ` +
              `some entries were described in words and carry no fibre figure, so the true ` +
              `total is higher. Do not tell her she is short on fibre from this number.`,
          ...dayFood.logged.map((l) =>
            `- ${l.slot}: ${l.description}${l.calories !== null ? ` (${l.calories} kcal)` : ""}`),
        ]
      : [`She has not logged any food ${isToday ? "today" : `on ${prettyDate(day)}`}.`];

    return [
      whichDay,
      `She is looking at ${isToday ? "THIS WEEK'S PLAN" : `the plan for the week of ${prettyDate(weekStart(day))}`}` +
        `${week.exists ? ` — "${week.title}"` : ""}.`,
      "Training:", ...training, "", "Meals planned:", ...food, "", ...eaten,
    ].filter(Boolean).join("\n");
  }

  // progress
  const [review, streak, sites, progression, eating] = await Promise.all([
    weekReview(profileId, u, weekStart(day), day),
    currentStreak(profileId, day),
    measurementProgress(profileId, u),
    exerciseProgression(profileId, u, { asOf: day }),
    nutritionTrend(profileId, 14, day),
  ]);

  // The direction is spelled out rather than left to be inferred from three
  // numbers. Asked to read "started 172, now 180, goal 146", the coach called a
  // 8lb gain "tracks for building muscle" — the opposite of the truth, and the
  // opposite of how it is meant to talk to her.
  const weight = (() => {
    const start = profile.startWeightKg;
    const now = review.latestWeightKg;
    const goal = profile.goalWeightKg;
    if (start === null || now === null) return "nothing recorded yet";

    const parts = [
      `started at ${weightOut(start, u)}${unit}`,
      `now ${weightOut(now, u)}${unit}`,
      goal !== null ? `goal ${weightOut(goal, u)}${unit}` : null,
    ].filter(Boolean);

    const moved = weightOut(now - start, u) ?? 0;
    if (goal !== null && Math.abs(moved) >= 0.5) {
      const wantsToLose = goal < start;
      const rightWay = wantsToLose ? moved < 0 : moved > 0;
      parts.push(
        `${Math.abs(moved)}${unit} ${moved > 0 ? "UP" : "DOWN"} from where she started — ` +
        `she is trying to ${wantsToLose ? "lose" : "gain"}, so this is the ` +
        `${rightWay ? "right" : "WRONG"} direction. Say so plainly either way.`,
      );
    }
    return parts.join(", ");
  })();

  return [
    whichDay,
    "She is looking at PROGRESS.",
    `Weight: ${weight || "nothing recorded"}.`,
    // On this screen the eating is what explains the weight line. The headline
    // already says how much of the window is actually logged; when that is
    // thin, say so instead of drawing a conclusion from it.
    `Eating (last ${eating.windowDays} days): ${eating.headline}` +
      (eating.trend === "under-logged" || eating.trend === "no-data"
        ? " Do not infer anything about her eating from this — there is not enough logged."
        : ""),
    `${isToday ? "This week" : `The week of ${prettyDate(weekStart(day))}`}: ${review.completed} of ${review.planned} sessions, ${review.totalSets} sets, ${streak}-day streak.`,
    review.remainingDays.length
      ? `Left to do this week: ${review.remainingDays.join(", ")}.`
      : "",
    review.missedDays.length
      ? `${review.weekOver ? "Not done last week" : "Missed so far this week"}: ${review.missedDays.join(", ")}.`
      : "",
    sites.length
      ? `Measurements: ${sites.map((s) => `${s.label} ${s.current}${lengthLabel(u)}${s.changeTotal !== null ? ` (${s.changeTotal > 0 ? "+" : ""}${s.changeTotal} total)` : ""}`).join("; ")}.`
      : "No measurements yet.",
    "",
    "Movement trends over twelve weeks, worst first:",
    ...(progression.length
      ? progression.map((p) => `- [${p.trend}] ${p.headline}`)
      : ["- nothing logged yet"]),
  ].filter(Boolean).join("\n");
}

/** What to ask, per screen. */
export const OPINION_PROMPT: Record<OpinionPage, string> = {
  train: "Give her your read on today's session so far. Be specific about the numbers in front of her, and say plainly if anything is down on last time.",
  plan: "Give her your read on this week's plan. Does the training match what she can actually do, and do the meals support it? Name anything you would change.",
  progress: "Give her your read on her progress. Lead with whatever matters most — a movement going backwards, one that has been dropped, or something genuinely working. Name the numbers.",
};

export const dayName = (i: number) => DAY_NAMES[i];

/**
 * What she is looking at, from the path she is on.
 *
 * The browser says *which* screen; the server reads what is on it. That
 * division is the whole security of this: a client that could author the
 * context could put words in the app's mouth, and the coach believes this
 * block completely.
 *
 * Returns null where there is nothing worth saying — an unknown path, or a
 * screen whose contents the coach already has in its state block.
 */
export type Screen =
  | { kind: "opinion"; page: OpinionPage; label: string; on: ISODate | null }
  | { kind: "library"; label: string }
  | { kind: "movement"; slug: string };

/**
 * The day a `?d=` names, or null — and null for anything that is not one.
 *
 * The screens that step back and forward all use `?d=`, and the coach has to
 * know which day is on the screen or it answers about today. That makes this
 * the second thing the browser gets to say, so it is held to the same standard
 * as the movement slug: an exact shape, parsed, and checked to be the date it
 * claims to be — "2026-02-31" round-trips to March and is refused rather than
 * quietly moved. A future date is refused too; she cannot be reading one.
 *
 * The value is never pasted into the prompt as given. Everything rendered from
 * it goes through `prettyDate`, so the most a hostile string can achieve is a
 * real date that is not the one she is on. A date in the future is turned away
 * in `buildPageContext`, where her today is known.
 */
export function dayInPath(path: string): ISODate | null {
  const raw = path.split("#")[0].split("?")[1];
  if (!raw) return null;
  const d = new URLSearchParams(raw).get("d");
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const parsed = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) return null;
  return d as ISODate;
}

/**
 * Which screen a path names — and nothing else.
 *
 * Pure and total on purpose: this is the only thing standing between a
 * client-supplied string and text the model treats as fact. It matches an
 * exact set of paths, and the one variable part is a slug constrained to
 * `[a-z0-9-]` which is then looked up by equality. Nothing from the path is
 * ever interpolated into the prompt.
 */
export function screenFor(path: string): Screen | null {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const on = dayInPath(path);

  if (clean === "/train") return { kind: "opinion", page: "train", on, label: on ? `the workout on ${prettyDate(on)}` : "today's workout" };
  if (clean === "/plan") return { kind: "opinion", page: "plan", on: null, label: "this week's plan" };
  // Eat and Kitchen are both about food this week, which is what the plan
  // context already assembles — planned meals, and what she has actually
  // eaten today, kept apart from each other.
  if (clean === "/eat") return { kind: "opinion", page: "plan", on, label: on ? `her food on ${prettyDate(on)}` : "today's food" };
  if (clean === "/kitchen") return { kind: "opinion", page: "plan", on: null, label: "the shopping and the kitchen" };
  if (clean === "/progress") return { kind: "opinion", page: "progress", on, label: on ? `her progress as of ${prettyDate(on)}` : "her progress" };
  if (clean === "/learn") return { kind: "library", label: "the movement library" };

  const move = clean.match(/^\/learn\/([a-z0-9-]+)$/);
  return move ? { kind: "movement", slug: move[1] } : null;
}

export async function contextForPath(
  profileId: string,
  path: string,
): Promise<{ label: string; context: string } | null> {
  const screen = screenFor(path);
  if (!screen) return null;

  if (screen.kind === "opinion") {
    return {
      label: screen.label,
      context: await buildPageContext(profileId, screen.page, screen.on ?? undefined),
    };
  }
  if (screen.kind === "library") {
    return { label: screen.label, context: "She is browsing the movement library." };
  }

  // Looked up by exact slug, and every word in the block below comes from the
  // row that came back — never from the path.
  const [ex] = await db.select({
    name: exercises.name, category: exercises.category,
    muscles: exercises.primaryMuscles, equipment: exercises.equipment,
    safetyNote: exercises.safetyNote,
  }).from(exercises).where(eq(exercises.slug, screen.slug)).limit(1);
  if (!ex) return null;

  return {
    label: `the ${ex.name} page`,
    context: [
      `She is reading the guide for ${ex.name}.`,
      `Works ${ex.muscles.join(", ")}. Equipment: ${ex.equipment.join(", ") || "none"}.`,
      ex.safetyNote ? `Safety note on the page: ${ex.safetyNote}` : "",
    ].filter(Boolean).join("\n"),
  };
}
