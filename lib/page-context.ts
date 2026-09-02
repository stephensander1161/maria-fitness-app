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
import { DAY_NAMES, weekStart } from "@/lib/date";

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
): Promise<string> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) return "No profile.";
  const u = profile.units;
  const unit = weightLabel(u);

  if (page === "train") {
    const view = await todayView(profileId, u, profileToday(profile));
    if (!view.hasPlan) return "She is looking at today's workout. There is no plan for this week.";

    const lines = view.exercises.map((e) => {
      const doneStr = e.loggedToday.length
        ? e.loggedToday.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}${unit}` : ""}`).join(", ")
        : "nothing yet";
      const last = e.lastTime
        ? e.lastTime.sets.map((s) => `${s.reps}${s.weight !== null ? `@${s.weight}` : ""}`).join(", ")
        : "no previous session";
      return `- ${e.name}${e.extra ? " (added today)" : ""}: target ${e.targetSets}×${e.targetReps}` +
        `${e.targetWeight !== null ? ` @ ${e.targetWeight}${unit}` : ""}. ` +
        `Logged today: ${doneStr}. Last time: ${last}.`;
    });

    return [
      `She is looking at TODAY'S WORKOUT — ${view.dayName}, "${view.title}".`,
      view.isRest ? "It is a rest day." : "",
      view.completed ? "She has already signed the session off." : "",
      ...lines,
    ].filter(Boolean).join("\n");
  }

  if (page === "plan") {
    const [week, mealWeek, dayFood] = await Promise.all([
      weekView(profileId, u, weekStart(profileToday(profile)), profileToday(profile)),
      mealWeekView(profileId, foodUnitsOf(profile), weekStart(profileToday(profile)), profileToday(profile)),
      dayFoodView(profileId, profileToday(profile)),
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
    const eaten = dayFood.logged.length
      ? [
          `EATEN so far today (this is actual intake, not the plan): ${dayFood.calories} kcal` +
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
      : ["She has not logged any food today."];

    return [
      `She is looking at THIS WEEK'S PLAN${week.exists ? ` — "${week.title}"` : ""}.`,
      "Training:", ...training, "", "Meals planned:", ...food, "", ...eaten,
    ].join("\n");
  }

  // progress
  const [review, streak, sites, progression, eating] = await Promise.all([
    weekReview(profileId, u),
    currentStreak(profileId, profileToday(profile)),
    measurementProgress(profileId, u),
    exerciseProgression(profileId, u, { asOf: profileToday(profile) }),
    nutritionTrend(profileId, 14, profileToday(profile)),
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
    "She is looking at PROGRESS.",
    `Weight: ${weight || "nothing recorded"}.`,
    // On this screen the eating is what explains the weight line. The headline
    // already says how much of the window is actually logged; when that is
    // thin, say so instead of drawing a conclusion from it.
    `Eating (last ${eating.windowDays} days): ${eating.headline}` +
      (eating.trend === "under-logged" || eating.trend === "no-data"
        ? " Do not infer anything about her eating from this — there is not enough logged."
        : ""),
    `This week: ${review.completed} of ${review.planned} sessions, ${review.totalSets} sets, ${streak}-day streak.`,
    review.missedDays.length ? `Still to do this week: ${review.missedDays.join(", ")}.` : "",
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
export async function contextForPath(
  profileId: string,
  path: string,
): Promise<{ label: string; context: string } | null> {
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";

  if (clean === "/train") {
    return { label: "today's workout", context: await buildPageContext(profileId, "train") };
  }
  if (clean === "/plan") {
    return { label: "this week's plan", context: await buildPageContext(profileId, "plan") };
  }
  if (clean === "/progress") {
    return { label: "her progress", context: await buildPageContext(profileId, "progress") };
  }
  if (clean === "/learn") {
    return { label: "the movement library", context: "She is browsing the movement library." };
  }

  const move = clean.match(/^\/learn\/([a-z0-9-]+)$/);
  if (move) {
    // Looked up by exact slug, so the path cannot smuggle text into the prompt.
    const [ex] = await db.select({
      name: exercises.name, category: exercises.category,
      muscles: exercises.primaryMuscles, equipment: exercises.equipment,
      safetyNote: exercises.safetyNote,
    }).from(exercises).where(eq(exercises.slug, move[1])).limit(1);
    if (!ex) return null;
    return {
      label: `the ${ex.name} page`,
      context: [
        `She is reading the guide for ${ex.name} (slug: ${move[1]}).`,
        `Works ${ex.muscles.join(", ")}. Equipment: ${ex.equipment.join(", ") || "none"}.`,
        ex.safetyNote ? `Safety note on the page: ${ex.safetyNote}` : "",
      ].filter(Boolean).join("\n"),
    };
  }

  return null;
}
