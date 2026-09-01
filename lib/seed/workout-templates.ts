/**
 * Ready-made training weeks, seeded as reference data alongside the exercise
 * library. Onboarding picks the closest match on days/kit/experience and
 * instantiates it immediately; the coach personalises from there.
 *
 * Rules the data keeps to:
 * • `exerciseSlug` is always a real slug from `lib/seed/exercises.ts`.
 * • `days` always has all seven entries, dayOfWeek 0=Monday … 6=Sunday.
 *   Non-training days are `isRest: true` with no exercises.
 * • Compounds first, isolation and core last.
 * • Timed holds and carries put the number of SECONDS in `reps`, and the note
 *   says so — there is nowhere else to put it.
 */

export type WorkoutTemplateExerciseSeed = {
  /** Must exist in EXERCISES. Resolved to an id when the plan is instantiated. */
  exerciseSlug: string;
  sortOrder: number;
  sets: number;
  /** Reps, or seconds for a hold/carry — the note spells out which. */
  reps: number;
  restSeconds: number;
  notes: string;
};

export type WorkoutTemplateDaySeed = {
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  title: string;
  focus: string | null;
  isRest: boolean;
  notes: string | null;
  exercises: WorkoutTemplateExerciseSeed[];
};

export type WorkoutTemplateSeed = {
  slug: string;
  name: string;
  description: string;
  daysPerWeek: number;
  equipment: string[];
  experience: string[];
  /** Matched against logged injuries, e.g. ["knees"]. */
  avoids: string[];
  sessionMinutes: number;
  days: WorkoutTemplateDaySeed[];
};

/** A rest day, written the same way every time. */
const rest = (dayOfWeek: number, notes: string): WorkoutTemplateDaySeed => ({
  dayOfWeek, title: "Rest", focus: null, isRest: true, notes, exercises: [],
});

export const WORKOUT_TEMPLATES: WorkoutTemplateSeed[] = [
  /* ── 1. Three full-body days, dumbbells and a bench ──────────────────────
   * The default for most people starting or restarting: everything gets
   * trained three times a week, which is where beginners make the fastest
   * progress, and a missed session costs a third of a week rather than all
   * of one muscle group.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "full-body-3-dumbbell",
    name: "Full Body 3× — Dumbbells & Bench",
    description: "Three full-body sessions a week with a pair of dumbbells and a bench — the best place to start if you're new to lifting or coming back after time off.",
    daysPerWeek: 3,
    equipment: ["dumbbell", "bench", "bodyweight", "mat"],
    experience: ["beginner", "returning"],
    avoids: [],
    sessionMinutes: 50,
    days: [
      {
        dayOfWeek: 0, title: "Full Body A", focus: "squat and press", isRest: false,
        notes: "First session of the week. Leave two reps in the tank on everything — you're learning the movements, not testing them.",
        exercises: [
          { exerciseSlug: "goblet-squat", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "Dumbbell held vertically against your chest, elbows tucked. Sit between your hips, heels down." },
          { exerciseSlug: "dumbbell-bench-press", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Elbows about 45 degrees from your body, not flared straight out. Lower until your upper arms reach bench level." },
          { exerciseSlug: "dumbbell-romanian-deadlift", sortOrder: 2, sets: 3, reps: 10, restSeconds: 90,
            notes: "Push the hips back, knees stay softly bent. Stop where the hamstrings stretch — usually mid-shin." },
          { exerciseSlug: "dumbbell-row", sortOrder: 3, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per arm. Pull the dumbbell to your hip, not your armpit, and keep your shoulders square to the floor." },
          { exerciseSlug: "dumbbell-shoulder-press", sortOrder: 4, sets: 2, reps: 12, restSeconds: 60,
            notes: "Ribs down, squeeze your glutes. If your lower back arches to finish the rep, the weight is too heavy." },
          { exerciseSlug: "plank", sortOrder: 5, sets: 3, reps: 30, restSeconds: 45,
            notes: "Reps are SECONDS — hold 30. Straight line from ear to ankle, glutes squeezed, no sagging hips." },
        ],
      },
      rest(1, "Walk if you fancy it. Expect some stiffness in the legs and chest tomorrow — that's normal for the first fortnight."),
      {
        dayOfWeek: 2, title: "Full Body B", focus: "single leg and incline press", isRest: false,
        notes: "Same muscles, different angles. The split squat is the one that will humble you — start bodyweight if you need to.",
        exercises: [
          { exerciseSlug: "split-squat", sortOrder: 0, sets: 3, reps: 8, restSeconds: 90,
            notes: "Per leg. Back heel stays up, front shin roughly vertical. Hold a rail for balance the first few sessions." },
          { exerciseSlug: "incline-dumbbell-press", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Bench at about 30 degrees. Any steeper and it turns into a shoulder press." },
          { exerciseSlug: "dumbbell-hip-thrust", sortOrder: 2, sets: 3, reps: 12, restSeconds: 75,
            notes: "Shoulder blades on the bench edge, chin tucked. Finish with ribs down and glutes squeezed, not a back arch." },
          { exerciseSlug: "chest-supported-row", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Chest stays on the bench the whole set. Lead with the elbows and pause a beat at the top." },
          { exerciseSlug: "lateral-raise", sortOrder: 4, sets: 2, reps: 12, restSeconds: 60,
            notes: "Light. Raise to shoulder height with a soft elbow — if you're swinging, halve the weight." },
          { exerciseSlug: "dead-bug", sortOrder: 5, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Lower back stays pressed into the floor; the moment it lifts, shorten the range." },
        ],
      },
      rest(3, "Rest day. A twenty-minute walk does more for tomorrow's session than sitting still does."),
      {
        dayOfWeek: 4, title: "Full Body C", focus: "hinge and horizontal press", isRest: false,
        notes: "Last one of the week. If a weight felt easy on Monday, add a little here.",
        exercises: [
          { exerciseSlug: "box-squat", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "Sit back to the bench, touch, stand. Touch — don't drop and bounce." },
          { exerciseSlug: "dumbbell-floor-press", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Upper arms rest on the floor for a beat at the bottom. Kind on the shoulders and easy to press from safely." },
          { exerciseSlug: "b-stance-romanian-deadlift", sortOrder: 2, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per leg. Back foot is a kickstand only — toes down, no weight through it." },
          { exerciseSlug: "dumbbell-bent-over-row", sortOrder: 3, sets: 3, reps: 10, restSeconds: 75,
            notes: "Hinge to roughly 45 degrees and hold it. Back flat, pull both dumbbells to your hips." },
          { exerciseSlug: "hammer-curl", sortOrder: 4, sets: 2, reps: 12, restSeconds: 60,
            notes: "Palms facing each other, elbows pinned to your ribs. No swinging from the hips." },
          { exerciseSlug: "side-plank", sortOrder: 5, sets: 3, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — 20 per side. Drop to bent knees if the hips sag." },
        ],
      },
      rest(5, "Rest. Something enjoyable and on your feet counts for plenty."),
      rest(6, "Rest. Worth a look at next week's sessions so Monday isn't a decision."),
    ],
  },

  /* ── 2. Three bodyweight days ────────────────────────────────────────────
   * No kit at all. Progression here is reps and leverage rather than load,
   * so the rep targets are deliberately higher.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "bodyweight-3-beginner",
    name: "Bodyweight 3× — No Equipment",
    description: "Three short sessions a week using nothing but your own weight and a bit of floor — for starting at home before you buy anything.",
    daysPerWeek: 3,
    equipment: ["bodyweight", "mat"],
    experience: ["beginner"],
    avoids: [],
    sessionMinutes: 30,
    days: [
      {
        dayOfWeek: 0, title: "Bodyweight A", focus: "squat, push, hinge", isRest: false,
        notes: "Without weights, the progress comes from control. Take three seconds to lower on everything.",
        exercises: [
          { exerciseSlug: "bodyweight-squat", sortOrder: 0, sets: 3, reps: 12, restSeconds: 60,
            notes: "Hips back first, then knees. Chest proud, weight through the middle of your foot." },
          { exerciseSlug: "incline-push-up", sortOrder: 1, sets: 3, reps: 10, restSeconds: 60,
            notes: "Hands on a worktop or the stairs. The lower the surface, the harder it gets — that's your progression." },
          { exerciseSlug: "glute-bridge", sortOrder: 2, sets: 3, reps: 15, restSeconds: 45,
            notes: "Heels close to your bum, push through them. Squeeze at the top for a full second." },
          { exerciseSlug: "prone-ytw-raise", sortOrder: 3, sets: 2, reps: 8, restSeconds: 45,
            notes: "Eight of each letter, face down, arms just off the floor. Tiny movements, big effect on desk shoulders." },
          { exerciseSlug: "bird-dog", sortOrder: 4, sets: 2, reps: 10, restSeconds: 45,
            notes: "Per side. Move slowly enough that a glass of water on your lower back wouldn't spill." },
          { exerciseSlug: "plank", sortOrder: 5, sets: 3, reps: 25, restSeconds: 45,
            notes: "Reps are SECONDS — hold 25. Stop the set when the hips start to drop, not when the clock says so." },
        ],
      },
      rest(1, "Rest. A walk is the best thing you can do with this day."),
      {
        dayOfWeek: 2, title: "Bodyweight B", focus: "lunge and core", isRest: false,
        notes: "More single-leg work today, which is where most balance and hip strength comes from.",
        exercises: [
          { exerciseSlug: "reverse-lunge", sortOrder: 0, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per leg. Step backwards, not forwards — it's much kinder to the front knee." },
          { exerciseSlug: "knee-push-up", sortOrder: 1, sets: 3, reps: 10, restSeconds: 60,
            notes: "Body still makes a straight line from knees to head. Don't let the hips lead the way up." },
          { exerciseSlug: "single-leg-glute-bridge", sortOrder: 2, sets: 3, reps: 8, restSeconds: 45,
            notes: "Per leg. Keep the hips level — the side that drops is the side that needs this." },
          { exerciseSlug: "superman-hold", sortOrder: 3, sets: 3, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — hold 20. Lengthen, don't crank; the back should feel worked, not pinched." },
          { exerciseSlug: "dead-bug", sortOrder: 4, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Exhale as the leg lowers and keep the lower back flat on the floor." },
          { exerciseSlug: "wall-sit", sortOrder: 5, sets: 2, reps: 30, restSeconds: 60,
            notes: "Reps are SECONDS — hold 30. Thighs as close to parallel as you can hold with your back flat to the wall." },
        ],
      },
      rest(3, "Rest. Stiff quads from Wednesday are expected; they settle after the first couple of weeks."),
      {
        dayOfWeek: 4, title: "Bodyweight C", focus: "hinge, overhead push, core", isRest: false,
        notes: "The pike push-up is your route towards a proper overhead press with no kit at all.",
        exercises: [
          { exerciseSlug: "single-leg-romanian-deadlift", sortOrder: 0, sets: 3, reps: 8, restSeconds: 60,
            notes: "Per leg. Hips stay square to the floor — imagine headlights on your hip bones pointing straight down." },
          { exerciseSlug: "pike-push-up", sortOrder: 1, sets: 3, reps: 6, restSeconds: 75,
            notes: "Hips high, head between your hands. Feet on a low step makes it harder when six gets easy." },
          { exerciseSlug: "split-squat", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per leg, bodyweight. Straight up and down — the front knee tracks over the middle toes." },
          { exerciseSlug: "close-grip-push-up", sortOrder: 3, sets: 2, reps: 8, restSeconds: 60,
            notes: "Hands under your shoulders, elbows brushing your ribs. Go to knees rather than lose the line." },
          { exerciseSlug: "hollow-hold", sortOrder: 4, sets: 3, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — hold 20. Bend the knees to make it easier; the lower back must stay down." },
          { exerciseSlug: "side-plank", sortOrder: 5, sets: 2, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — 20 per side. Stack the hips and lift them towards the ceiling." },
        ],
      },
      rest(5, "Rest. Get outside if the weather allows."),
      rest(6, "Rest. Nothing to do today except turn up on Monday."),
    ],
  },

  /* ── 3. Four days, upper/lower, dumbbells and a bench ────────────────────
   * For someone who has trained consistently for a few months and wants more
   * volume per muscle than a full-body week can fit.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "upper-lower-4-dumbbell",
    name: "Upper / Lower 4× — Dumbbells & Bench",
    description: "Four sessions split into two upper and two lower days, for when full-body three times a week has stopped being enough.",
    daysPerWeek: 4,
    equipment: ["dumbbell", "bench", "bodyweight", "mat"],
    experience: ["intermediate"],
    avoids: [],
    sessionMinutes: 55,
    days: [
      {
        dayOfWeek: 0, title: "Upper A", focus: "horizontal press and row", isRest: false,
        notes: "The first two lifts are the ones to push. Everything after is there to support them.",
        exercises: [
          { exerciseSlug: "dumbbell-bench-press", sortOrder: 0, sets: 4, reps: 8, restSeconds: 120,
            notes: "Heaviest press of the week. Shoulder blades pinned back, feet planted, control the lowering." },
          { exerciseSlug: "dumbbell-row", sortOrder: 1, sets: 4, reps: 10, restSeconds: 90,
            notes: "Per arm. Pull to the hip and pause; no twisting the torso to finish the rep." },
          { exerciseSlug: "incline-dumbbell-press", sortOrder: 2, sets: 3, reps: 10, restSeconds: 90,
            notes: "Bench at 30 degrees. Lighter than the flat press — expect roughly 80% of that weight." },
          { exerciseSlug: "chest-supported-row", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Chest glued to the bench so the lower back sits this one out entirely." },
          { exerciseSlug: "dumbbell-shoulder-press", sortOrder: 4, sets: 3, reps: 10, restSeconds: 75,
            notes: "Seated with back support if the lower back wants to arch. Press slightly forward of your ears." },
          { exerciseSlug: "lateral-raise", sortOrder: 5, sets: 3, reps: 15, restSeconds: 45,
            notes: "Deliberately light and deliberately slow. Three seconds down on every rep." },
        ],
      },
      {
        dayOfWeek: 1, title: "Lower A", focus: "squat pattern", isRest: false,
        notes: "Squat-led. If the goblet squat is limited by how much you can hold rather than your legs, we'll switch you to a front squat.",
        exercises: [
          { exerciseSlug: "goblet-squat", sortOrder: 0, sets: 4, reps: 8, restSeconds: 120,
            notes: "Elbows inside the knees at the bottom. Depth is whatever keeps a flat back and heels down." },
          { exerciseSlug: "dumbbell-romanian-deadlift", sortOrder: 1, sets: 4, reps: 8, restSeconds: 120,
            notes: "Weights drag down the legs the whole way. Felt in the hamstrings, not the lower back." },
          { exerciseSlug: "bulgarian-split-squat", sortOrder: 2, sets: 3, reps: 10, restSeconds: 90,
            notes: "Per leg. Set up about two feet from the bench — too close and the knee takes it all." },
          { exerciseSlug: "dumbbell-hip-thrust", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Chin tucked, ribs down, one-second squeeze at the top of every rep." },
          { exerciseSlug: "calf-raise", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Full range: heels below the step, then all the way up onto the toes. Pause at both ends." },
          { exerciseSlug: "plank", sortOrder: 5, sets: 3, reps: 45, restSeconds: 45,
            notes: "Reps are SECONDS — hold 45. Squeeze the glutes hard; that's what stops the hips sagging." },
        ],
      },
      rest(2, "Rest in the middle of the week — deliberately, so the back half is as good as the front half."),
      {
        dayOfWeek: 3, title: "Upper B", focus: "floor press, rows, arms", isRest: false,
        notes: "Different angles from Monday and a bit more arm work. Rest is shorter — this one should feel brisker.",
        exercises: [
          { exerciseSlug: "dumbbell-floor-press", sortOrder: 0, sets: 4, reps: 8, restSeconds: 105,
            notes: "Pause with the upper arms on the floor, then press. No bouncing the elbows." },
          { exerciseSlug: "dumbbell-bent-over-row", sortOrder: 1, sets: 4, reps: 8, restSeconds: 105,
            notes: "Hold the hinge for the whole set. If your back rounds on the last rep, that set was one too many." },
          { exerciseSlug: "half-kneeling-press", sortOrder: 2, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per arm. Back knee down, glute of that side squeezed — it stops the ribs flaring." },
          { exerciseSlug: "dumbbell-chest-fly", sortOrder: 3, sets: 3, reps: 12, restSeconds: 60,
            notes: "Soft elbows held fixed, wide arc. Stop the stretch level with the bench, not below it." },
          { exerciseSlug: "rear-delt-fly", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Light. Think about widening your arms rather than lifting them." },
          { exerciseSlug: "hammer-curl", sortOrder: 5, sets: 3, reps: 12, restSeconds: 45,
            notes: "Elbows pinned to your sides, no hip swing. Lower slower than you lift." },
        ],
      },
      {
        dayOfWeek: 4, title: "Lower B", focus: "hinge and single leg", isRest: false,
        notes: "Hinge-led and heavier on balance. Lower reps on the deadlift — treat it as a strength lift.",
        exercises: [
          { exerciseSlug: "dumbbell-deadlift", sortOrder: 0, sets: 4, reps: 6, restSeconds: 120,
            notes: "Dumbbells outside the feet. Set a flat back before anything leaves the floor." },
          { exerciseSlug: "split-squat", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Per leg, dumbbells at your sides. Straight up and down, back heel high." },
          { exerciseSlug: "single-leg-romanian-deadlift", sortOrder: 2, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per leg. One light dumbbell in the opposite hand. Hips square, no opening up to the side." },
          { exerciseSlug: "step-up", sortOrder: 3, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per leg. Push through the whole foot on the bench — don't push off the floor with the trailing leg." },
          { exerciseSlug: "single-leg-glute-bridge", sortOrder: 4, sets: 3, reps: 12, restSeconds: 45,
            notes: "Per leg. Keep both hip bones level all the way up." },
          { exerciseSlug: "side-plank", sortOrder: 5, sets: 3, reps: 30, restSeconds: 45,
            notes: "Reps are SECONDS — 30 per side. Hips stacked and lifted, not rolled back." },
        ],
      },
      rest(5, "Rest. Two clear days now — use them."),
      rest(6, "Rest. Four days of training only works if these two are real rest days."),
    ],
  },

  /* ── 4. Three days, bands and bodyweight ─────────────────────────────────
   * Fits in a suitcase. Bands give the most tension at the end of the range,
   * so the cues lean on pausing where it's hardest rather than chasing load.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "bands-3-travel",
    name: "Bands 3× — Travel & Small Space",
    description: "Three sessions built on resistance bands and your own weight, for a hotel room, a small flat, or a week away from your kit.",
    daysPerWeek: 3,
    equipment: ["resistance band", "bodyweight", "mat"],
    experience: ["beginner", "returning"],
    avoids: [],
    sessionMinutes: 30,
    days: [
      {
        dayOfWeek: 0, title: "Bands A", focus: "full body", isRest: false,
        notes: "Bands are hardest at the end of the range, so pause for a beat at the point of most tension on every rep.",
        exercises: [
          { exerciseSlug: "bodyweight-squat", sortOrder: 0, sets: 3, reps: 15, restSeconds: 60,
            notes: "Three seconds down, one second up. Slowing it down is how bodyweight stays challenging." },
          { exerciseSlug: "band-chest-press", sortOrder: 1, sets: 3, reps: 12, restSeconds: 60,
            notes: "Band around your upper back, anchored under the shoulder blades. Press and pause with arms straight." },
          { exerciseSlug: "band-row", sortOrder: 2, sets: 3, reps: 12, restSeconds: 60,
            notes: "Band round your feet, sit tall. Pull to the ribs, shoulder blades together, hold a beat." },
          { exerciseSlug: "band-overhead-press", sortOrder: 3, sets: 3, reps: 12, restSeconds: 60,
            notes: "Stand on the band, ribs down. Press slightly forward of your head, not behind it." },
          { exerciseSlug: "band-pull-apart", sortOrder: 4, sets: 2, reps: 15, restSeconds: 45,
            notes: "Arms straight, pull the band to your chest. The antidote to a day at a desk." },
          { exerciseSlug: "plank", sortOrder: 5, sets: 3, reps: 30, restSeconds: 45,
            notes: "Reps are SECONDS — hold 30. Glutes squeezed, ribs down, no sag." },
        ],
      },
      rest(1, "Rest. If you're travelling, a walk somewhere new counts as the day's movement."),
      {
        dayOfWeek: 2, title: "Bands B", focus: "lunge and pull", isRest: false,
        notes: "More pulling today, which is what most people are short of when they train without a gym.",
        exercises: [
          { exerciseSlug: "reverse-lunge", sortOrder: 0, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per leg. Step back and lower straight down; the front shin stays close to vertical." },
          { exerciseSlug: "band-lat-pulldown", sortOrder: 1, sets: 3, reps: 12, restSeconds: 60,
            notes: "Band over a door frame or fixed above you. Pull the elbows down towards your back pockets." },
          { exerciseSlug: "incline-push-up", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Hands on a desk or bed edge. Lower until your chest reaches your hands, then press." },
          { exerciseSlug: "band-pull-through", sortOrder: 3, sets: 3, reps: 12, restSeconds: 60,
            notes: "Band anchored low behind you, between your legs. Hinge back, then drive the hips forward to stand." },
          { exerciseSlug: "pallof-press", sortOrder: 4, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Band anchored at chest height beside you. Press straight out and refuse to rotate." },
          { exerciseSlug: "dead-bug", sortOrder: 5, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Exhale as the leg lowers, lower back stays flat on the floor." },
        ],
      },
      rest(3, "Rest. Nothing required today."),
      {
        dayOfWeek: 4, title: "Bands C", focus: "glutes and shoulders", isRest: false,
        notes: "Shorter and hip-focused. Good one to keep if the week has gone sideways.",
        exercises: [
          { exerciseSlug: "glute-bridge", sortOrder: 0, sets: 3, reps: 15, restSeconds: 45,
            notes: "Band above the knees if you have one. Push the knees out against it as you drive up." },
          { exerciseSlug: "push-up", sortOrder: 1, sets: 3, reps: 8, restSeconds: 60,
            notes: "Hands on a chair or the wall if the floor is too much — same movement, less load." },
          { exerciseSlug: "band-single-arm-row", sortOrder: 2, sets: 3, reps: 12, restSeconds: 60,
            notes: "Per arm. Pull to the hip and resist the torso twisting round to help." },
          { exerciseSlug: "band-lateral-walk", sortOrder: 3, sets: 3, reps: 12, restSeconds: 45,
            notes: "Twelve steps each way. Small half-squat held throughout, toes pointing forward." },
          { exerciseSlug: "band-external-rotation", sortOrder: 4, sets: 2, reps: 15, restSeconds: 45,
            notes: "Per arm. Elbow pinned to your side, rotate the forearm outwards. Slow and light." },
          { exerciseSlug: "side-plank", sortOrder: 5, sets: 3, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — 20 per side. Bent knees is a perfectly good version." },
        ],
      },
      rest(5, "Rest. Walk if you're somewhere worth walking."),
      rest(6, "Rest. Repack the bands so Monday needs no decisions."),
    ],
  },

  /* ── 5. Four days, full gym ──────────────────────────────────────────────
   * Barbells, machines and cables. Two lower and two upper days, each led by
   * one heavy compound and finished with machine work that's safe to push.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "full-gym-4-intermediate",
    name: "Full Gym 4× — Upper / Lower",
    description: "Four gym sessions a week built round the barbell squat, bench, deadlift and pull-up, for someone comfortable with the basics who wants a proper strength block.",
    daysPerWeek: 4,
    equipment: ["full gym", "barbell", "squat rack", "machine", "cable", "dumbbell", "bench", "pull-up bar"],
    experience: ["intermediate"],
    avoids: [],
    sessionMinutes: 60,
    days: [
      {
        dayOfWeek: 0, title: "Lower A", focus: "back squat", isRest: false,
        notes: "Squat day. Set the rack pins just below your bottom position before the first working set — every time, not just when it's heavy.",
        exercises: [
          { exerciseSlug: "barbell-back-squat", sortOrder: 0, sets: 4, reps: 6, restSeconds: 180,
            notes: "Bar on the traps, big breath into the belly, same bar path down and up over the midfoot." },
          { exerciseSlug: "hip-thrust", sortOrder: 1, sets: 3, reps: 10, restSeconds: 120,
            notes: "Chin tucked, ribs down. Finish with a hard glute squeeze rather than a lower-back arch." },
          { exerciseSlug: "leg-press", sortOrder: 2, sets: 3, reps: 12, restSeconds: 90,
            notes: "Lower until your hips are about to tuck under, then stop. Never lock the knees out hard at the top." },
          { exerciseSlug: "leg-curl", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Three seconds to lower on every rep — hamstrings respond to the lowering more than the lifting." },
          { exerciseSlug: "calf-raise", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Full stretch at the bottom, pause at the top. Don't bounce through it." },
          { exerciseSlug: "pallof-press", sortOrder: 5, sets: 3, reps: 12, restSeconds: 45,
            notes: "Per side, on the cable. Press out slowly and give away nothing to the rotation." },
        ],
      },
      {
        dayOfWeek: 1, title: "Upper A", focus: "bench press", isRest: false,
        notes: "Bench-led. If you're benching alone, use the rack safeties or dumbbells — no exceptions on the top set.",
        exercises: [
          { exerciseSlug: "barbell-bench-press", sortOrder: 0, sets: 4, reps: 6, restSeconds: 180,
            notes: "Shoulder blades pinned back and down, feet planted. Bar touches the lower chest, elbows about 45 degrees." },
          { exerciseSlug: "lat-pulldown", sortOrder: 1, sets: 4, reps: 10, restSeconds: 90,
            notes: "Chest up, pull the bar to your collarbone. No leaning back to drag it down." },
          { exerciseSlug: "overhead-press", sortOrder: 2, sets: 3, reps: 8, restSeconds: 120,
            notes: "Glutes and abs braced, head moves back then through as the bar passes your face." },
          { exerciseSlug: "seated-cable-row", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Torso still. Pull to the belly button, shoulder blades together, then control it back out." },
          { exerciseSlug: "lateral-raise", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Light, slow, no swing. This one is never a strength lift." },
          { exerciseSlug: "tricep-pushdown", sortOrder: 5, sets: 3, reps: 12, restSeconds: 45,
            notes: "Elbows locked to your sides, full lockout at the bottom." },
        ],
      },
      rest(2, "Rest. Mid-week gap by design — the deadlift on Thursday needs you fresh."),
      {
        dayOfWeek: 3, title: "Lower B", focus: "deadlift", isRest: false,
        notes: "Deadlift day. Five reps, and stop the set the moment the back rounds — that rep is worth nothing anyway.",
        exercises: [
          { exerciseSlug: "barbell-deadlift", sortOrder: 0, sets: 4, reps: 5, restSeconds: 180,
            notes: "Bar over the midfoot, shins to the bar, pull the slack out, then push the floor away." },
          { exerciseSlug: "bulgarian-split-squat", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Per leg. Far enough from the bench that the front shin stays near vertical." },
          { exerciseSlug: "leg-extension", sortOrder: 2, sets: 3, reps: 12, restSeconds: 75,
            notes: "Moderate weight, pause at the top. Back off the range if the kneecap complains." },
          { exerciseSlug: "back-extension", sortOrder: 3, sets: 3, reps: 12, restSeconds: 75,
            notes: "Round up to a straight line and no further. Glutes finish the movement, not the lower back." },
          { exerciseSlug: "single-leg-calf-raise", sortOrder: 4, sets: 3, reps: 12, restSeconds: 45,
            notes: "Per leg, holding something for balance. Full stretch, full contraction." },
          { exerciseSlug: "hanging-knee-raise", sortOrder: 5, sets: 3, reps: 10, restSeconds: 60,
            notes: "Curl the pelvis up rather than just lifting the thighs. No swinging between reps." },
        ],
      },
      {
        dayOfWeek: 4, title: "Upper B", focus: "vertical pull", isRest: false,
        notes: "Pull-led. The aim of the block is unassisted pull-ups — take a band off as soon as six is comfortable.",
        exercises: [
          { exerciseSlug: "assisted-pull-up", sortOrder: 0, sets: 4, reps: 6, restSeconds: 150,
            notes: "Machine or a band round the knee. Chest to the bar, control the way down — that's where the strength is built." },
          { exerciseSlug: "incline-dumbbell-press", sortOrder: 1, sets: 4, reps: 10, restSeconds: 90,
            notes: "Bench at 30 degrees. Elbows at 45 degrees, wrists stacked over the elbows." },
          { exerciseSlug: "chest-supported-row", sortOrder: 2, sets: 3, reps: 12, restSeconds: 75,
            notes: "Chest stays down on the bench. Pause a beat at the top of every rep." },
          { exerciseSlug: "dumbbell-shoulder-press", sortOrder: 3, sets: 3, reps: 10, restSeconds: 75,
            notes: "Seated with back support. Ribs down — no arching to grind out the last rep." },
          { exerciseSlug: "face-pull", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Rope to eye level, pull towards your forehead, thumbs back. Cheap insurance for the shoulders." },
          { exerciseSlug: "bicep-curl", sortOrder: 5, sets: 3, reps: 12, restSeconds: 45,
            notes: "Elbows still, no swing. Lower over three seconds." },
        ],
      },
      rest(5, "Rest. Sleep is doing the actual work now."),
      rest(6, "Rest. Check the weights you logged and pick Monday's squat before you get there."),
    ],
  },

  /* ── 6. Three days, dumbbells only, knee-friendly ────────────────────────
   * Written for a knee that doesn't tolerate deep flexion: no squats, lunges,
   * split squats, step-ups or leg extensions. Strength comes from the hips
   * instead, which is what a cranky knee needs anyway.
   * ─────────────────────────────────────────────────────────────────────── */
  {
    slug: "knee-friendly-3-dumbbell",
    name: "Knee-Friendly 3× — Dumbbells",
    description: "Three full-body sessions with dumbbells and no deep knee bending at all — hip-led strength for when squats and lunges aren't on the table.",
    daysPerWeek: 3,
    equipment: ["dumbbell", "bodyweight", "mat"],
    experience: ["beginner", "returning"],
    avoids: ["knees", "knee"],
    sessionMinutes: 45,
    days: [
      {
        dayOfWeek: 0, title: "Hips & Push", focus: "hinge and horizontal press", isRest: false,
        notes: "Nothing here bends the knee past about 90 degrees or loads it in a bent position. Strong hips take work off the knee — that's the whole plan.",
        exercises: [
          { exerciseSlug: "dumbbell-romanian-deadlift", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "Knees stay softly bent and unchanged throughout — this is a hip movement, not a knee one." },
          { exerciseSlug: "dumbbell-floor-press", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "Lying on the floor, upper arms rest for a beat at the bottom, then press." },
          { exerciseSlug: "glute-bridge", sortOrder: 2, sets: 3, reps: 15, restSeconds: 60,
            notes: "A dumbbell across the hips once bodyweight is easy. Drive through the heels, no knee load at all." },
          { exerciseSlug: "dumbbell-bent-over-row", sortOrder: 3, sets: 3, reps: 10, restSeconds: 75,
            notes: "Hinge to about 45 degrees and hold. Pull both dumbbells to your hips, back flat." },
          { exerciseSlug: "dumbbell-shoulder-press", sortOrder: 4, sets: 2, reps: 12, restSeconds: 60,
            notes: "Standing, ribs down, glutes squeezed. Stop the set before the lower back starts helping." },
          { exerciseSlug: "dead-bug", sortOrder: 5, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Lower back pressed into the floor the whole time." },
        ],
      },
      rest(1, "Rest. Walking on the flat is usually fine and usually helps — hills and stairs are the ones to be careful with."),
      {
        dayOfWeek: 2, title: "Hips & Pull", focus: "deadlift and rows", isRest: false,
        notes: "If the knee is sore rather than stiff before you start, do the upper-body work and leave the hinge for another day.",
        exercises: [
          { exerciseSlug: "dumbbell-deadlift", sortOrder: 0, sets: 3, reps: 8, restSeconds: 90,
            notes: "Dumbbells outside the feet, back flat before anything lifts. Push the floor away — don't drop into a squat to reach them." },
          { exerciseSlug: "push-up", sortOrder: 1, sets: 3, reps: 8, restSeconds: 75,
            notes: "Hands on a worktop if the floor version breaks form. Body in one straight line." },
          { exerciseSlug: "single-leg-glute-bridge", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per leg. Hips level all the way up — this is the single best glute exercise that asks nothing of the knee." },
          { exerciseSlug: "renegade-row", sortOrder: 3, sets: 3, reps: 8, restSeconds: 75,
            notes: "Per arm. Feet wide for stability, hips deliberately still. Drop to knees only if the knee is happy on a mat." },
          { exerciseSlug: "lateral-raise", sortOrder: 4, sets: 2, reps: 12, restSeconds: 60,
            notes: "Light, to shoulder height, soft elbow. Three seconds to lower." },
          { exerciseSlug: "side-plank", sortOrder: 5, sets: 3, reps: 20, restSeconds: 45,
            notes: "Reps are SECONDS — 20 per side. Straight-leg version keeps the knee out of it entirely." },
        ],
      },
      rest(3, "Rest. Ice or heat if the knee is grumbling, whichever you've found helps."),
      {
        dayOfWeek: 4, title: "Hips & Balance", focus: "single-leg hinge and upper body", isRest: false,
        notes: "Balance work today. Hold a wall or a chair — steadying yourself is sensible, not cheating.",
        exercises: [
          { exerciseSlug: "single-leg-romanian-deadlift", sortOrder: 0, sets: 3, reps: 8, restSeconds: 75,
            notes: "Per leg. Standing knee stays soft and still; the hinge happens entirely at the hip." },
          { exerciseSlug: "dumbbell-floor-press", sortOrder: 1, sets: 3, reps: 12, restSeconds: 75,
            notes: "Lighter than Monday, one more rep per set. Pause on the floor between reps." },
          { exerciseSlug: "b-stance-romanian-deadlift", sortOrder: 2, sets: 3, reps: 10, restSeconds: 75,
            notes: "Per leg. Back foot is a kickstand only, toes lightly down, no weight through that knee." },
          { exerciseSlug: "clamshell", sortOrder: 3, sets: 3, reps: 15, restSeconds: 45,
            notes: "Per side, lying on your side. Hips stacked, knees together, open the top knee without rolling back." },
          { exerciseSlug: "calf-raise", sortOrder: 4, sets: 3, reps: 15, restSeconds: 45,
            notes: "Standing, straight legs. Calf strength is part of what absorbs load before it reaches the knee." },
          { exerciseSlug: "plank", sortOrder: 5, sets: 3, reps: 30, restSeconds: 45,
            notes: "Reps are SECONDS — hold 30. On the toes, not the knees, so the knee stays unloaded." },
        ],
      },
      rest(5, "Rest. A flat walk or a swim if you want to move."),
      rest(6, "Rest. If the knee felt better this week than last, say so — it changes what we add next."),
    ],
  },
  {
    slug: "full-body-3-dumbbell-no-bench",
    name: "Full Body 3× — Dumbbells, No Bench",
    description: "Three full-body sessions built for a pair of dumbbells and a floor. Everything a bench would do is done pressing from the floor or half-kneeling instead, so nothing here needs kit you have to buy.",
    daysPerWeek: 3,
    equipment: ["dumbbell", "bodyweight", "mat"],
    experience: ["beginner", "returning"],
    avoids: [],
    sessionMinutes: 45,
    days: [
      {
        dayOfWeek: 0, title: "Squat & Push", focus: "squat and horizontal press", isRest: false,
        notes: "Start lighter than you think for the first week. The goal is finishing every set with clean form, not finding your limit.",
        exercises: [
          { exerciseSlug: "goblet-squat", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "One dumbbell held at the chest. Elbows inside the knees at the bottom, chest tall." },
          { exerciseSlug: "dumbbell-floor-press", sortOrder: 1, sets: 3, reps: 10, restSeconds: 90,
            notes: "This is the bench press without a bench. Upper arms touch down for a beat, then press." },
          { exerciseSlug: "dumbbell-bent-over-row", sortOrder: 2, sets: 3, reps: 10, restSeconds: 75,
            notes: "Hinge to about 45 degrees and stay there. Pull to your hips, not your chest." },
          { exerciseSlug: "dumbbell-shoulder-press", sortOrder: 3, sets: 2, reps: 12, restSeconds: 60,
            notes: "Standing, ribs down. Stop the set when your lower back starts helping." },
          { exerciseSlug: "dead-bug", sortOrder: 4, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side. Lower back stays pressed into the floor the whole time." },
        ],
      },
      rest(1, "Rest. A walk is good for you today — it helps you recover rather than costing you anything."),
      {
        dayOfWeek: 2, title: "Hinge & Pull", focus: "hip hinge and rows", isRest: false,
        notes: "The hinge is the movement worth learning properly. If your back rounds, drop the weight and keep going.",
        exercises: [
          { exerciseSlug: "dumbbell-romanian-deadlift", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "Push your hips back, dumbbells close to your legs. Stop when you feel the hamstrings, not when you reach the floor." },
          { exerciseSlug: "push-up", sortOrder: 1, sets: 3, reps: 8, restSeconds: 75,
            notes: "Hands on a worktop or the stairs if the floor version breaks form. That is a progression, not a failure." },
          { exerciseSlug: "single-leg-glute-bridge", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per leg. Keep the hips level all the way up — that is the whole exercise." },
          { exerciseSlug: "renegade-row", sortOrder: 3, sets: 3, reps: 8, restSeconds: 75,
            notes: "Per arm. Feet wide, hips deliberately still. Drop to your knees if the hips start rocking." },
          { exerciseSlug: "side-plank", sortOrder: 4, sets: 2, reps: 20, restSeconds: 45,
            notes: "Seconds, per side. Knees down if 20 seconds on the feet is too long." },
        ],
      },
      rest(3, "Rest."),
      {
        dayOfWeek: 4, title: "Legs & Carry", focus: "single leg and loaded carries", isRest: false,
        notes: "Single-leg work is where most of the balance and hip strength comes from, and it needs far less weight than you would expect.",
        exercises: [
          { exerciseSlug: "reverse-lunge", sortOrder: 0, sets: 3, reps: 10, restSeconds: 90,
            notes: "Per leg. Stepping backwards is kinder on the front knee than stepping forwards." },
          { exerciseSlug: "dumbbell-deadlift", sortOrder: 1, sets: 3, reps: 8, restSeconds: 90,
            notes: "Dumbbells outside the feet, back flat before anything leaves the floor." },
          { exerciseSlug: "half-kneeling-press", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Per side. Kneeling stops you leaning back, which is the usual cheat on an overhead press." },
          { exerciseSlug: "farmer-carry", sortOrder: 3, sets: 3, reps: 30, restSeconds: 60,
            notes: "Seconds, not reps. Heavy as you can hold with shoulders back. Grip is the point." },
          { exerciseSlug: "bird-dog", sortOrder: 4, sets: 3, reps: 10, restSeconds: 45,
            notes: "Per side, slowly. Opposite arm and leg, hips square to the floor." },
        ],
      },
      rest(5, "Rest."),
      rest(6, "Rest. Tell your coach how the week went — that is what shapes next week."),
    ],
  },
  {
    slug: "postpartum-rebuild-3",
    name: "Post-Partum Rebuild 3×",
    description: "Three short sessions a week that start with breathing and the deep core, then add gentle load. Nothing here needs equipment or a floor you can't get up from easily. It is deliberately unhurried — this is the foundation the rest is built on, and rushing it is the one mistake that costs months.",
    daysPerWeek: 3,
    equipment: ["bodyweight", "mat"],
    experience: ["beginner", "returning"],
    avoids: ["postpartum", "post-partum", "post partum", "diastasis", "pelvic floor", "c-section", "caesarean"],
    sessionMinutes: 25,
    days: [
      {
        dayOfWeek: 0, title: "Breath & Connection", focus: "breathing and pelvic floor", isRest: false,
        notes: "If you have not had your postnatal check yet, this session is still fine — it is breathing and gentle activation. Everything with load in it waits for clearance, and longer after a caesarean.",
        exercises: [
          { exerciseSlug: "diaphragmatic-breathing", sortOrder: 0, sets: 2, reps: 10, restSeconds: 30,
            notes: "Ten breaths. Ribs wide and sideways, not just the belly rising." },
          { exerciseSlug: "postpartum-connection-breath", sortOrder: 1, sets: 2, reps: 10, restSeconds: 30,
            notes: "Breathe out as the floor lifts and the belly draws in. That pairing is what carries into lifting the car seat." },
          { exerciseSlug: "pelvic-floor-activation", sortOrder: 2, sets: 2, reps: 8, restSeconds: 45,
            notes: "Small lifts, and fully let go between each one. The release matters as much as the lift." },
          { exerciseSlug: "pelvic-floor-relaxation", sortOrder: 3, sets: 1, reps: 8, restSeconds: 30,
            notes: "Eight slow breaths. A floor that cannot relax is as much a problem as one that cannot lift." },
          { exerciseSlug: "cat-cow", sortOrder: 4, sets: 2, reps: 8, restSeconds: 30,
            notes: "Gentle, within comfort. A good way to finish." },
        ],
      },
      rest(1, "Rest. A walk with the pram counts for more than you would think right now."),
      {
        dayOfWeek: 2, title: "Deep Core & Glutes", focus: "core coordination and hips", isRest: false,
        notes: "Watch your midline on everything here. A ridge or doming down the centre means the effort is more than the tissue is ready for — do fewer, or go back a step. That is information, not failure.",
        exercises: [
          { exerciseSlug: "tva-activation", sortOrder: 0, sets: 2, reps: 10, restSeconds: 30,
            notes: "Light tension under the fingers, never a hard bulge." },
          { exerciseSlug: "core-heel-slide", sortOrder: 1, sets: 2, reps: 8, restSeconds: 45,
            notes: "Per side. Stop the slide where the back arches — that point moves out over weeks." },
          { exerciseSlug: "glute-bridge", sortOrder: 2, sets: 3, reps: 10, restSeconds: 60,
            notes: "Breathe out on the way up. Drive through the heels." },
          { exerciseSlug: "clamshell", sortOrder: 3, sets: 2, reps: 12, restSeconds: 45,
            notes: "Per side. Hips stacked, no rolling backwards." },
          { exerciseSlug: "wall-plank", sortOrder: 4, sets: 2, reps: 20, restSeconds: 45,
            notes: "Seconds, not reps. Breathe the whole time." },
        ],
      },
      rest(3, "Rest."),
      {
        dayOfWeek: 4, title: "Standing Strength & Posture", focus: "everyday carrying and posture", isRest: false,
        notes: "This session is about the things the day actually asks of you — getting up off the floor, carrying a baby on one hip, feeding hunched over. Exhale on the effort every time.",
        exercises: [
          { exerciseSlug: "bodyweight-squat", sortOrder: 0, sets: 3, reps: 10, restSeconds: 60,
            notes: "To a chair if that is easier. Breathe out on the way up." },
          { exerciseSlug: "hip-hinge-drill", sortOrder: 1, sets: 2, reps: 10, restSeconds: 45,
            notes: "The pattern for picking up everything you will pick up today." },
          { exerciseSlug: "knee-push-up", sortOrder: 2, sets: 2, reps: 8, restSeconds: 60,
            notes: "Hands on a worktop instead if that is better. Both are real push-ups." },
          { exerciseSlug: "chin-tuck", sortOrder: 3, sets: 2, reps: 10, restSeconds: 30,
            notes: "The antidote to a day spent looking down at a baby." },
          { exerciseSlug: "scapular-squeeze", sortOrder: 4, sets: 2, reps: 10, restSeconds: 30,
            notes: "Opens up everything that feeding closes down." },
          { exerciseSlug: "standing-pelvic-tilt", sortOrder: 5, sets: 1, reps: 10, restSeconds: 30,
            notes: "Can be done at the kettle. No mat required." },
        ],
      },
      rest(5, "Rest."),
      rest(6, "Rest. Tell your coach how the week felt — especially anything that felt heavy, dragging or leaked. Those are worth acting on, not pushing through."),
    ],
  },
];
