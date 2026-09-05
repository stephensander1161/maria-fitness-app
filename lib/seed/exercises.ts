type Seed = {
  slug: string; name: string;
  category: "compound" | "isolation" | "cardio" | "mobility" | "core";
  primaryMuscles: string[]; equipment: string[];
  /** Extra search terms — the complaint, not the muscle. */
  tags?: string[];
  formCues: string[]; commonMistakes: string[]; safetyNote?: string;
  easier?: string[]; harder?: string[];
  unilateral?: boolean; bodyweight?: boolean;
  /** Held, not counted: seconds are the unit. */
  isHold?: boolean;
  /** Metabolic equivalent; omit to take the category default. */
  met?: number;
};

/**
 * The library is also the form/posture resource: every entry carries ordered
 * setup cues, the mistakes people actually make, a stop-and-check note, and
 * named regressions/progressions the coach can swap in by slug.
 */
export const EXERCISES: Seed[] = [
  // ── Lower body ────────────────────────────────────────────────────────────
  {
    slug: "goblet-squat", name: "Goblet Squat", category: "compound",
    primaryMuscles: ["quads", "glutes", "core"], equipment: ["dumbbell", "kettlebell"],
    formCues: [
      "Hold one dumbbell vertically against your chest, elbows tucked in.",
      "Feet shoulder-width, toes turned out about 15 degrees.",
      "Brace your stomach as if about to be poked, then sit down between your hips.",
      "Drive the floor away through your midfoot and squeeze your glutes at the top.",
    ],
    commonMistakes: [
      "Knees caving inward — think about spreading the floor apart with your feet.",
      "Heels lifting, which usually means the weight drifted forward onto your toes.",
      "Rounding the lower back at the bottom; stop the descent where your back stays flat.",
    ],
    safetyNote: "Depth is individual. Go as low as you can keep a neutral spine and heels down — forcing depth is where backs get hurt.",
    easier: ["box-squat", "bodyweight-squat", "wall-sit"], harder: ["dumbbell-front-squat", "barbell-back-squat", "bulgarian-split-squat"],
  },
  {
    slug: "bodyweight-squat", name: "Bodyweight Squat", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Feet shoulder-width, arms out front as a counterweight.",
      "Push your hips back first, then bend the knees.",
      "Keep your chest proud and your weight through the middle of your foot.",
      "Stand all the way up and squeeze your glutes.",
    ],
    commonMistakes: ["Knees travelling far past the toes before the hips move back.", "Looking down, which pulls the chest forward."],
    harder: ["goblet-squat"],
  },
  {
    slug: "barbell-back-squat", name: "Barbell Back Squat", category: "compound",
    primaryMuscles: ["quads", "glutes", "core"], equipment: ["barbell", "squat rack", "full gym"],
    formCues: [
      "Bar rests on the shelf of your upper traps, not on your neck bones.",
      "Squeeze your shoulder blades together to build that shelf before you unrack.",
      "Two steps back, feet set, big breath into the belly, then descend.",
      "Same bar path down and up — the bar stays over your midfoot throughout.",
    ],
    commonMistakes: ["Hips shooting up faster than the chest out of the bottom.", "Bouncing out of the bottom rather than controlling it."],
    safetyNote: "Always squat inside a rack with the safety pins set just below your bottom position. Never train to failure without them.",
    easier: ["goblet-squat"], harder: ["barbell-deadlift"],
  },
  {
    slug: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift", category: "compound",
    primaryMuscles: ["hamstrings", "glutes", "lower back"], equipment: ["dumbbell"],
    formCues: [
      "Dumbbells in front of your thighs, soft bend in the knees that never changes.",
      "Push your hips backward and let the weights slide down your legs, touching the whole way.",
      "Stop when you feel a strong stretch in the back of your thighs — usually mid-shin.",
      "Drive your hips forward to stand, finishing with a glute squeeze, not a lean-back.",
    ],
    commonMistakes: ["Turning it into a squat by bending the knees more as you descend.", "Letting the weights drift away from the legs, which loads the lower back."],
    safetyNote: "This is a hinge, not a bend. If you feel it mostly in your lower back rather than your hamstrings, reduce the range and the weight.",
    easier: ["hip-hinge-drill", "glute-bridge"], harder: ["b-stance-romanian-deadlift", "barbell-deadlift"],
  },
  {
    slug: "barbell-deadlift", name: "Barbell Deadlift", category: "compound",
    primaryMuscles: ["hamstrings", "glutes", "back", "core"], equipment: ["barbell", "full gym"],
    formCues: [
      "Bar over the middle of your foot, roughly an inch from your shins.",
      "Hinge down and grip just outside your legs; drop your hips until your shins touch the bar.",
      "Pull the slack out of the bar and set your back flat before anything moves.",
      "Push the floor away and stand tall — the bar drags up your legs.",
    ],
    commonMistakes: ["Jerking the bar off the floor before the back is set.", "Hips rising first, turning it into a stiff-legged pull.", "Hyperextending at the top."],
    safetyNote: "Stop the set the moment your lower back rounds. One ugly rep is worth more injury risk than the whole session is worth in progress.",
    easier: ["trap-bar-deadlift", "dumbbell-romanian-deadlift"], harder: [],
  },
  {
    slug: "hip-thrust", name: "Barbell Hip Thrust", category: "compound",
    primaryMuscles: ["glutes", "hamstrings"], equipment: ["barbell", "bench", "full gym"],
    formCues: [
      "Upper back on the bench just below the shoulder blades, bar padded across the hips.",
      "Feet flat, shins vertical at the top of the movement.",
      "Tuck your chin and ribs down, then drive through your heels.",
      "Squeeze hard at the top for a full second — the top is the whole point.",
    ],
    commonMistakes: ["Overarching the lower back at the top instead of squeezing the glutes.", "Feet too close, turning it into a quad exercise."],
    easier: ["dumbbell-hip-thrust", "glute-bridge"], harder: [],
  },
  {
    slug: "glute-bridge", name: "Glute Bridge", category: "compound",
    primaryMuscles: ["glutes", "hamstrings"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Lie on your back, knees bent, feet flat and hip-width apart.",
      "Press through your heels and lift your hips until your body is a straight line from knee to shoulder.",
      "Squeeze your glutes at the top, then lower under control.",
    ],
    commonMistakes: ["Arching the lower back to gain height.", "Pushing through the toes instead of the heels."],
    harder: ["single-leg-glute-bridge", "hip-thrust"],
  },
  {
    slug: "bulgarian-split-squat", name: "Bulgarian Split Squat", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["dumbbell", "bench"], unilateral: true,
    formCues: [
      "Back foot on a bench behind you, front foot about two feet forward.",
      "Drop straight down — the front shin stays fairly vertical.",
      "Keep most of your weight on the front leg; the back leg is a kickstand.",
      "Push through the front heel to stand.",
    ],
    commonMistakes: ["Front foot too close, hammering the knee.", "Leaning forward and turning it into a lunge."],
    safetyNote: "Balance-heavy. Hold something for support the first few sessions rather than fighting the wobble with heavy weight.",
    easier: ["split-squat", "step-up", "walking-lunge"], harder: [],
  },
  {
    slug: "walking-lunge", name: "Walking Lunge", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["bodyweight", "dumbbell"], unilateral: true,
    formCues: [
      "Step forward far enough that both knees can reach 90 degrees.",
      "Lower straight down until the back knee is just off the floor.",
      "Push through the front heel to bring the back leg through into the next step.",
      "Torso upright throughout.",
    ],
    commonMistakes: ["Short steps, which drives the front knee way past the toes.", "Letting the back knee slam the floor."],
    easier: ["reverse-lunge", "step-up"], harder: ["bulgarian-split-squat"],
  },
  {
    slug: "step-up", name: "Dumbbell Step-Up", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["dumbbell", "bench", "box"], unilateral: true,
    formCues: [
      "Box height around knee level to start.",
      "Place the whole foot on the box, not just the toes.",
      "Drive through the top heel and stand up without pushing off the bottom foot.",
      "Lower yourself down slowly — the descent is where the strength is built.",
    ],
    commonMistakes: ["Bouncing off the trailing foot to cheat the rep.", "Box too high, forcing a forward lean."],
    harder: ["split-squat", "step-down", "bulgarian-split-squat"],
  },
  {
    slug: "leg-press", name: "Leg Press", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["machine", "full gym"],
    formCues: [
      "Feet shoulder-width in the middle of the platform.",
      "Lower until your knees reach roughly 90 degrees.",
      "Keep your lower back flat against the pad the entire time.",
      "Press back up without snapping the knees straight.",
    ],
    commonMistakes: ["Going so deep the hips curl off the seat and round the lower back.", "Locking the knees hard at the top."],
    safetyNote: "Your lower back lifting off the pad is the hard stop on depth. That is where leg press injuries come from.",
    easier: ["bodyweight-squat"], harder: ["barbell-back-squat"],
  },
  {
    slug: "calf-raise", name: "Standing Calf Raise", category: "isolation",
    primaryMuscles: ["calves"], equipment: ["bodyweight", "dumbbell", "machine"],
    formCues: ["Balls of the feet on a step, heels hanging free.", "Rise as high as you can and pause a beat at the top.", "Lower slowly until you feel a stretch."],
    commonMistakes: ["Bouncing through reps using the tendon rather than the muscle."],
    harder: ["single-leg-calf-raise"],
  },
  {
    slug: "wall-sit", name: "Wall Sit", category: "isolation",
    isHold: true,
    primaryMuscles: ["quads"], equipment: ["bodyweight"], bodyweight: true,
    formCues: ["Back flat against a wall, slide down until your thighs are parallel to the floor.", "Knees directly above ankles.", "Hold and breathe normally."],
    commonMistakes: ["Resting hands on the thighs to take the load off."],
    harder: ["band-spanish-squat", "bodyweight-squat"],
  },

  {
    slug: "box-squat", name: "Box Squat", category: "compound",
    primaryMuscles: ["quads", "glutes", "hamstrings"], equipment: ["bodyweight", "dumbbell", "bench", "box"],
    formCues: [
      "Set a bench or box behind you at a height where the bottom position is comfortable.",
      "Push your hips back and reach for the box with your backside, not by bending the knees first.",
      "Touch the box lightly and stay braced — don't flop down and relax onto it.",
      "Drive through the whole foot to stand, squeezing your glutes at the top.",
    ],
    commonMistakes: [
      "Dropping onto the box and losing the brace, then restarting from dead stop with a rounded back.",
      "Sitting straight down instead of back, which loads the knee rather than the hip.",
    ],
    safetyNote: "A fixed depth makes this the friendliest squat for a cranky knee. Raise the box until the bottom is painless and work there — you can lower it over weeks.",
    easier: ["wall-sit", "bodyweight-squat"], harder: ["goblet-squat"],
  },
  {
    slug: "heels-elevated-goblet-squat", name: "Heels-Elevated Goblet Squat", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["dumbbell", "kettlebell"],
    formCues: [
      "Heels on a small wedge, plate, or a couple of folded books — an inch is plenty.",
      "Dumbbell at your chest, elbows tucked, torso as upright as you can hold it.",
      "Sit straight down between your hips; the lift lets the knees travel forward comfortably.",
      "Stand through the middle of the foot without letting the chest fold forward.",
    ],
    commonMistakes: [
      "Elevating so high the heels are unstable.",
      "Still pushing the hips far back, which throws away the point of the elevation.",
    ],
    safetyNote: "A more upright torso means more quad and less lower back. If the knee dislikes it, the fix is usually less depth, not less elevation.",
    easier: ["goblet-squat"], harder: ["dumbbell-front-squat"],
  },
  {
    slug: "dumbbell-front-squat", name: "Dumbbell Front Squat", category: "compound",
    primaryMuscles: ["quads", "glutes", "core"], equipment: ["dumbbell"],
    formCues: [
      "Dumbbells resting on the front of your shoulders, elbows pointing forward and up.",
      "Feet shoulder-width, stomach braced hard — a front load wants to fold you over.",
      "Sit down between your hips, keeping the elbows high the whole way.",
      "Stand and squeeze your glutes without leaning back at the top.",
    ],
    commonMistakes: [
      "Elbows dropping, which rounds the upper back.",
      "Going heavier than your torso can stay upright under.",
    ],
    easier: ["goblet-squat"], harder: ["barbell-back-squat"],
  },
  {
    slug: "split-squat", name: "Dumbbell Split Squat", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["dumbbell", "bodyweight"], unilateral: true,
    formCues: [
      "Split your stance front to back, about two feet apart, both feet pointing forward.",
      "Most of your weight stays on the front leg; the back foot is a kickstand for balance.",
      "Drop straight down until the back knee is just off the floor.",
      "Push through the front heel to stand, torso tall throughout.",
    ],
    commonMistakes: [
      "Stance too short, which drives the front knee hard over the toes.",
      "Pushing off the back foot to stand instead of loading the front leg.",
    ],
    easier: ["step-up"], harder: ["reverse-lunge", "bulgarian-split-squat"],
  },
  {
    slug: "reverse-lunge", name: "Reverse Lunge", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["bodyweight", "dumbbell"], unilateral: true,
    formCues: [
      "Step backward, not forward — the front knee stays where it started.",
      "Lower straight down until the back knee brushes the floor.",
      "Weight in the front heel, torso upright.",
      "Drive through the front foot to bring the back leg home.",
    ],
    commonMistakes: [
      "Short step back, which forces the front knee forward.",
      "Leaning out over the front thigh instead of staying stacked.",
    ],
    safetyNote: "Stepping back means nothing to decelerate through the front knee. It is usually the first lunge worth retrying after a knee complains.",
    easier: ["split-squat"], harder: ["walking-lunge"],
  },
  {
    slug: "lateral-lunge", name: "Lateral Lunge", category: "compound",
    primaryMuscles: ["quads", "glutes", "adductors"], equipment: ["bodyweight", "dumbbell"], unilateral: true,
    formCues: [
      "Step wide to one side, both feet flat and pointing forward.",
      "Push the hips back and bend the stepping knee; the other leg stays straight.",
      "Chest up, weight through the heel of the bent leg.",
      "Push off hard to return to standing.",
    ],
    commonMistakes: [
      "Letting the trailing leg bend, which turns it into a wobbly half-squat.",
      "Rounding the back to reach lower instead of sitting the hips back.",
    ],
    easier: ["band-lateral-walk"],
  },
  {
    slug: "sumo-squat", name: "Dumbbell Sumo Squat", category: "compound",
    primaryMuscles: ["glutes", "adductors", "quads"], equipment: ["dumbbell", "kettlebell"],
    formCues: [
      "Feet well wider than shoulders, toes turned out about 30 degrees.",
      "Hold one dumbbell hanging between your legs, arms straight.",
      "Sit straight down with the knees tracking out over the toes.",
      "Squeeze the glutes and inner thighs to stand.",
    ],
    commonMistakes: [
      "Knees collapsing inward on the way up.",
      "Turning the feet out further than the hips can follow, which twists the knee.",
    ],
    easier: ["bodyweight-squat"], harder: ["goblet-squat"],
  },
  {
    slug: "band-spanish-squat", name: "Spanish Squat", category: "compound",
    primaryMuscles: ["quads"], equipment: ["resistance band"],
    formCues: [
      "Loop a heavy band around a solid anchor at knee height and around the back of both knees.",
      "Walk back until the band is tight, then sit straight down as if into a chair.",
      "The band pulls your knees backward, so the shins stay close to vertical.",
      "Hold at the bottom or move slowly — keep the tension constant.",
    ],
    commonMistakes: [
      "Anchoring the band above or below the joint line so it presses on the knee itself.",
      "Leaning forward over the thighs to make it easier.",
    ],
    safetyNote: "A physio staple for knees that dislike loaded squatting — real quad work with very little knee travel. It should feel like effort, never like pain.",
    easier: ["wall-sit"], harder: ["box-squat"],
  },
  {
    slug: "step-down", name: "Step-Down", category: "compound",
    primaryMuscles: ["quads", "glutes"], equipment: ["bodyweight", "bench", "box"], bodyweight: true, unilateral: true,
    formCues: [
      "Stand on a low step on one leg, the other foot hanging off the side.",
      "Lower slowly — about three seconds — until the free heel just kisses the floor.",
      "Keep the standing knee tracking over the second toe rather than caving in.",
      "Push back up through the standing heel.",
    ],
    commonMistakes: [
      "Dropping fast and bouncing off the floor.",
      "Letting the hip of the standing leg collapse outward.",
    ],
    safetyNote: "Start with a step only a few inches high. This is the movement that exposes whether you actually control the knee, so buy the control before the height.",
    easier: ["step-up"], harder: ["bulgarian-split-squat"],
  },
  {
    slug: "terminal-knee-extension", name: "Banded Terminal Knee Extension", category: "isolation",
    primaryMuscles: ["quads"], equipment: ["resistance band"], unilateral: true,
    formCues: [
      "Anchor a band at knee height and step into it so it pulls the back of your knee forward.",
      "Step back until there is real tension, working leg slightly bent.",
      "Straighten the knee against the band and squeeze the quad hard at the top.",
      "Let it bend back slowly — the range is only a few inches.",
    ],
    commonMistakes: [
      "Swinging the whole leg instead of just straightening the knee.",
      "Standing too close, so there is no tension to work against.",
    ],
    safetyNote: "Low-load quad work that most irritable knees tolerate well. Good as a warm-up before leg days.",
    harder: ["band-spanish-squat"],
  },
  {
    slug: "leg-extension", name: "Machine Leg Extension", category: "isolation",
    primaryMuscles: ["quads"], equipment: ["machine", "full gym"],
    formCues: [
      "Set the back pad so your knee lines up with the machine's pivot.",
      "Straighten the legs smoothly and squeeze at the top.",
      "Lower slowly rather than letting the stack drop.",
    ],
    commonMistakes: [
      "Swinging the weight up with a hip thrust.",
      "Snapping into lockout under heavy weight.",
    ],
    safetyNote: "Loaded right at the end of the range, this can be sharp on a sensitive knee. Shorten the range from the bottom before you drop the exercise.",
    easier: ["terminal-knee-extension"], harder: ["leg-press"],
  },
  {
    slug: "leg-curl", name: "Machine Leg Curl", category: "isolation",
    primaryMuscles: ["hamstrings"], equipment: ["machine", "full gym"],
    formCues: [
      "Line the machine's pivot up with your knee joint before you start.",
      "Curl your heels toward your backside without the hips lifting off the pad.",
      "Pause briefly at the top, then lower all the way under control.",
    ],
    commonMistakes: [
      "Hips popping up to help, which cuts the hamstrings out of it.",
      "Letting the weight slam back down.",
    ],
    easier: ["glute-bridge"], harder: ["slider-hamstring-curl"],
  },
  {
    slug: "single-leg-calf-raise", name: "Single-Leg Calf Raise", category: "isolation",
    primaryMuscles: ["calves"], equipment: ["bodyweight", "dumbbell"], bodyweight: true, unilateral: true,
    formCues: [
      "Ball of one foot on a step, fingertips on a wall for balance only.",
      "Rise as high as you can and pause a beat at the top.",
      "Lower until you feel a stretch, then go again.",
    ],
    commonMistakes: [
      "Pulling on the wall to help the rep up.",
      "Cutting the range short at both ends.",
    ],
    easier: ["calf-raise"],
  },
  {
    slug: "hip-hinge-drill", name: "Dowel Hip Hinge", category: "mobility",
    primaryMuscles: ["hamstrings", "glutes", "lower back"], equipment: ["bodyweight", "dowel"], bodyweight: true,
    formCues: [
      "Hold a broomstick along your spine, touching the back of your head, your upper back, and your tailbone.",
      "Soft knees, then push your hips straight back toward the wall behind you.",
      "All three contact points stay on the stick the whole way down and up.",
      "Go only as far as you can keep them — that is your current hinge range.",
    ],
    commonMistakes: [
      "Losing contact at the lower back, which is exactly the round you are trying to catch.",
      "Bending the knees more instead of pushing the hips back.",
    ],
    safetyNote: "Worth five minutes before your first few deadlift sessions. Almost every hinge injury starts as a rounded rep nobody noticed.",
    harder: ["dumbbell-romanian-deadlift", "band-pull-through"],
  },
  {
    slug: "band-pull-through", name: "Band Pull-Through", category: "compound",
    primaryMuscles: ["glutes", "hamstrings"], equipment: ["resistance band"],
    formCues: [
      "Anchor the band low behind you and pass it between your legs, an end in each hand.",
      "Walk forward until it is tight, feet shoulder-width, knees soft.",
      "Push your hips back and let the band draw your hands between your legs.",
      "Snap the hips forward to stand tall and squeeze the glutes — the arms stay passive.",
    ],
    commonMistakes: [
      "Pulling with the arms, which turns it into a row.",
      "Finishing with a lean-back instead of a glute squeeze.",
    ],
    easier: ["hip-hinge-drill"], harder: ["dumbbell-romanian-deadlift", "kettlebell-swing"],
  },
  {
    slug: "b-stance-romanian-deadlift", name: "B-Stance Romanian Deadlift", category: "compound",
    primaryMuscles: ["hamstrings", "glutes"], equipment: ["dumbbell"], unilateral: true,
    formCues: [
      "Working foot flat, the other foot slid back so only the toes touch and the heel is raised.",
      "About 80% of your weight is on the front leg; the back toes are balance only.",
      "Hinge from the hips with the same soft-knee, flat-back pattern as a two-leg RDL.",
      "Drive the front hip forward to stand.",
    ],
    commonMistakes: [
      "Putting real weight through the back foot, which makes it a two-leg lift again.",
      "Letting the hips twist open toward the working side.",
    ],
    easier: ["dumbbell-romanian-deadlift"], harder: ["single-leg-romanian-deadlift"],
  },
  {
    slug: "single-leg-romanian-deadlift", name: "Single-Leg Romanian Deadlift", category: "compound",
    primaryMuscles: ["hamstrings", "glutes", "core"], equipment: ["dumbbell", "bodyweight"], unilateral: true,
    formCues: [
      "Weight in the hand opposite the standing leg, soft bend in that knee that never changes.",
      "Hinge forward and let the back leg lift behind you, hips staying square to the floor.",
      "Lower until you feel a strong hamstring stretch, then drive the hip forward to stand.",
      "Fix your eyes on a spot a few feet ahead — it steadies the balance more than anything else.",
    ],
    commonMistakes: [
      "Hips rotating open as the back leg lifts.",
      "Rounding the back to get the weight closer to the floor.",
    ],
    easier: ["b-stance-romanian-deadlift"],
  },
  {
    slug: "kettlebell-swing", name: "Kettlebell Swing", category: "compound",
    primaryMuscles: ["glutes", "hamstrings", "core"], equipment: ["kettlebell", "dumbbell"],
    formCues: [
      "Hike the bell back between your legs like a rugby pass, forearms against your thighs.",
      "Snap the hips forward hard and let the bell float up — it is a hinge, not a lift.",
      "Arms stay loose; the bell stops around chest height on its own.",
      "Let it fall back and reload the hips just before it reaches your legs.",
    ],
    commonMistakes: [
      "Squatting the bell up and down instead of hinging.",
      "Lifting with the shoulders once the hips have finished.",
      "Arching the lower back at the top instead of squeezing the glutes.",
    ],
    safetyNote: "The usual swing injury is a lower back finishing the rep the glutes should have. If you feel it in your back, drop the weight and rebuild the hinge.",
    easier: ["band-pull-through", "dumbbell-romanian-deadlift"],
  },
  {
    slug: "dumbbell-deadlift", name: "Dumbbell Deadlift", category: "compound",
    primaryMuscles: ["hamstrings", "glutes", "back", "core"], equipment: ["dumbbell"],
    formCues: [
      "Dumbbells on the floor just outside your feet, feet hip-width.",
      "Hinge down and bend the knees until you can reach the handles with a flat back.",
      "Take the slack out — chest up, armpits tight — then push the floor away.",
      "Stand tall, then hinge them back down rather than dropping them.",
    ],
    commonMistakes: [
      "Squatting down to the weights with the hips far too low.",
      "Rounding the back to reach the floor — set the dumbbells on blocks instead.",
    ],
    easier: ["dumbbell-romanian-deadlift"], harder: ["trap-bar-deadlift", "barbell-deadlift"],
  },
  {
    slug: "trap-bar-deadlift", name: "Trap Bar Deadlift", category: "compound",
    primaryMuscles: ["quads", "glutes", "hamstrings", "back"], equipment: ["trap bar", "full gym"],
    formCues: [
      "Stand in the middle of the bar, feet hip-width, handles beside you.",
      "Hinge down and grip the handles with a flat back and the chest up.",
      "Take the slack out, then push the floor away and stand tall.",
      "Lower it back down in the same shape you lifted it with.",
    ],
    commonMistakes: [
      "Feet off-centre, so the bar tips forward or back on the way up.",
      "Yanking it off the floor before the back is set.",
    ],
    safetyNote: "The neutral handles keep the load closer to your centre, so it is usually kinder to the lower back than a straight bar. A good place to start pulling heavy again.",
    easier: ["dumbbell-deadlift"], harder: ["barbell-deadlift"],
  },
  {
    slug: "slider-hamstring-curl", name: "Slider Hamstring Curl", category: "isolation",
    primaryMuscles: ["hamstrings", "glutes"], equipment: ["bodyweight", "sliders", "mat"], bodyweight: true,
    formCues: [
      "On your back, heels on furniture sliders or a towel on a smooth floor.",
      "Lift your hips into a bridge and keep them there for the whole set.",
      "Slide the heels away until the legs are nearly straight, then pull them back in.",
      "End the set when the hips start dropping — that is the hamstrings giving out.",
    ],
    commonMistakes: [
      "Letting the hips sag as the legs extend.",
      "Sliding out further than you can pull back without collapsing.",
    ],
    safetyNote: "Hamstring cramp is common in the first few sessions. Start with three or four reps, not a full set.",
    easier: ["glute-bridge", "leg-curl"], harder: ["nordic-curl"],
  },
  {
    slug: "nordic-curl", name: "Eccentric Nordic Curl", category: "isolation",
    primaryMuscles: ["hamstrings"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Kneel on a mat with your ankles anchored under something solid.",
      "Squeeze your glutes so hips and shoulders stay in one line — no hinging at the hip.",
      "Lower forward as slowly as you can, resisting the whole way.",
      "Catch yourself with your hands and push back to the start.",
    ],
    commonMistakes: [
      "Folding at the hips so the torso tips instead of the whole body lowering as one plank.",
      "Free-falling through the last third instead of fighting it.",
    ],
    safetyNote: "One of the best-evidenced hamstring injury preventatives, and one of the most reliable ways to get very sore. Two or three reps for the first week is genuinely enough.",
    easier: ["slider-hamstring-curl"],
  },
  {
    slug: "single-leg-glute-bridge", name: "Single-Leg Glute Bridge", category: "compound",
    primaryMuscles: ["glutes", "hamstrings"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "On your back, one foot flat, the other knee hugged toward your chest.",
      "Press through the planted heel until hips are level with knee and shoulder.",
      "Keep both hip bones level — no tilting toward the free side.",
      "Lower under control rather than dropping between reps.",
    ],
    commonMistakes: [
      "Hips dropping on the free-leg side.",
      "Arching the lower back to gain height.",
    ],
    easier: ["glute-bridge"], harder: ["dumbbell-hip-thrust"],
  },
  {
    slug: "dumbbell-hip-thrust", name: "Dumbbell Hip Thrust", category: "compound",
    primaryMuscles: ["glutes", "hamstrings"], equipment: ["dumbbell", "bench"],
    formCues: [
      "Upper back on a bench just below the shoulder blades, dumbbell resting across your hips.",
      "Feet flat, heels roughly under your knees at the top.",
      "Tuck your chin and ribs, then drive through the heels.",
      "Hold the top for a full second before lowering.",
    ],
    commonMistakes: [
      "Finishing with a lower-back arch instead of a glute squeeze.",
      "Bench too high, which makes the shoulders the pivot instead of the upper back.",
    ],
    easier: ["glute-bridge", "single-leg-glute-bridge"], harder: ["hip-thrust"],
  },
  {
    slug: "clamshell", name: "Banded Clamshell", category: "isolation",
    primaryMuscles: ["glutes", "hip abductors"], equipment: ["bodyweight", "resistance band", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "Lie on your side, knees bent about 45 degrees, heels in line with your spine.",
      "Stack the hips and stop the top hip rolling backward.",
      "Open the top knee while the feet stay together.",
      "Lower slowly — no drop between reps.",
    ],
    commonMistakes: [
      "Rolling the top hip back for more range, which hands the work to the lower back.",
      "Rushing, so the glute never actually gets loaded.",
    ],
    harder: ["band-lateral-walk"],
  },
  {
    slug: "band-lateral-walk", name: "Banded Lateral Walk", category: "isolation",
    primaryMuscles: ["glutes", "hip abductors"], equipment: ["resistance band"],
    formCues: [
      "Loop a band just above the knees, or around the ankles for more.",
      "Drop into a quarter-squat and stay there — chest up, feet pointing forward.",
      "Step sideways leading with the heel, keeping constant tension on the band.",
      "Small steps, and never let the trailing foot click into the leading one.",
    ],
    commonMistakes: [
      "Standing tall and waddling from the hips.",
      "Knees collapsing toward each other between steps.",
    ],
    easier: ["clamshell"], harder: ["lateral-lunge"],
  },
  {
    slug: "quadruped-hip-extension", name: "Quadruped Hip Extension", category: "isolation",
    primaryMuscles: ["glutes"], equipment: ["bodyweight", "resistance band", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "On hands and knees, back flat, stomach braced.",
      "Keep the working knee bent at 90 degrees and press the sole of the foot toward the ceiling.",
      "Stop when the thigh is level with your torso — the lower back should not move at all.",
      "Squeeze at the top, then lower without touching down.",
    ],
    commonMistakes: [
      "Arching the lower back to lift the leg higher.",
      "Rotating the hips open toward the working side.",
    ],
    easier: ["glute-bridge"], harder: ["single-leg-glute-bridge"],
  },
  {
    slug: "superman-hold", name: "Superman Hold", category: "core",
    isHold: true,
    primaryMuscles: ["lower back", "glutes"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Lie face down, arms out in front, forehead just off the mat.",
      "Squeeze the glutes first, then lift arms, chest, and legs a few inches.",
      "Reach long rather than high — length, not height.",
      "Look at the floor so the neck stays in line.",
    ],
    commonMistakes: [
      "Cranking the head back and compressing the neck.",
      "Lifting high enough that the lower back pinches.",
    ],
    harder: ["back-extension"],
  },
  {
    slug: "back-extension", name: "45-Degree Back Extension", category: "compound",
    primaryMuscles: ["lower back", "glutes", "hamstrings"], equipment: ["machine", "full gym"],
    formCues: [
      "Set the pad just below your hip bones so you can hinge freely.",
      "Arms crossed on your chest, glutes squeezed.",
      "Lower by hinging at the hip with a flat back, then rise until the body is one straight line.",
      "Stop at straight — do not arch backward past it.",
    ],
    commonMistakes: [
      "Rounding and un-rounding the spine instead of hinging at the hip.",
      "Swinging past straight into an arch at the top.",
    ],
    easier: ["superman-hold", "bird-dog"],
  },

  // ── Upper body: push ──────────────────────────────────────────────────────
  {
    slug: "push-up", name: "Push-Up", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders", "core"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Hands slightly wider than shoulders, fingers spread.",
      "Body in one straight line from heels to head — squeeze glutes and brace your stomach.",
      "Lower until your chest is a fist's height off the floor, elbows at about 45 degrees from your body.",
      "Push the floor away and let your shoulder blades spread at the top.",
    ],
    commonMistakes: ["Hips sagging — brace harder or regress to incline push-ups.", "Elbows flaring straight out to the sides, which grinds the shoulder.", "Head dropping toward the floor before the chest."],
    easier: ["knee-push-up", "incline-push-up"], harder: ["dumbbell-floor-press", "dumbbell-bench-press"],
  },
  {
    slug: "incline-push-up", name: "Incline Push-Up", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["bodyweight", "bench"], bodyweight: true,
    formCues: ["Hands on a bench, counter, or wall — the higher the surface, the easier.", "Same straight line from heels to head.", "Lower your chest to the surface with control."],
    commonMistakes: ["Letting the hips pike up to shorten the range."],
    harder: ["knee-push-up", "push-up"],
  },
  {
    slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["dumbbell", "bench"],
    formCues: [
      "Lie back with the dumbbells at chest level, shoulder blades pinched together and down.",
      "Wrists stacked directly over your elbows.",
      "Press up and slightly together without clanking the weights.",
      "Lower until your upper arms are level with your torso.",
    ],
    commonMistakes: ["Letting the shoulder blades come unglued from the bench.", "Dropping the elbows far below the bench and straining the shoulder."],
    easier: ["dumbbell-floor-press", "push-up"], harder: ["incline-dumbbell-press", "barbell-bench-press"],
  },
  {
    slug: "chest-press-machine", name: "Chest Press Machine", category: "compound",
    primaryMuscles: ["chest", "triceps"], equipment: ["machine", "full gym"],
    formCues: ["Set the seat so the handles line up with the middle of your chest.", "Back and shoulders stay against the pad.", "Press smoothly and stop just short of locking out."],
    commonMistakes: ["Seat too low, turning it into a shoulder press."],
  },
  {
    slug: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", category: "compound",
    primaryMuscles: ["shoulders", "triceps"], equipment: ["dumbbell"],
    formCues: [
      "Start with the dumbbells at ear height, palms facing forward.",
      "Squeeze your glutes and brace your stomach so your lower back doesn't arch.",
      "Press straight up until your arms are almost locked.",
      "Lower under control back to ear height.",
    ],
    commonMistakes: ["Arching the lower back to press heavier weight.", "Pressing forward instead of straight up."],
    safetyNote: "If overhead pressing pinches your shoulder, switch to a neutral grip with palms facing each other before dropping the movement entirely.",
    easier: ["band-overhead-press", "lateral-raise"], harder: ["half-kneeling-press", "overhead-press"],
  },
  {
    slug: "overhead-press", name: "Barbell Overhead Press", category: "compound",
    primaryMuscles: ["shoulders", "triceps", "core"], equipment: ["barbell", "full gym"],
    formCues: ["Bar on your front shoulders, hands just outside shoulder width.", "Squeeze glutes and brace hard — this is a standing plank.", "Move your head back slightly, press the bar past your face, then push your head through at the top."],
    commonMistakes: ["Leaning back to turn it into an incline press.", "Pressing around the face instead of past it."],
    easier: ["dumbbell-shoulder-press"],
  },
  {
    slug: "lateral-raise", name: "Dumbbell Lateral Raise", category: "isolation",
    primaryMuscles: ["shoulders"], equipment: ["dumbbell"],
    formCues: ["Light dumbbells, slight bend in the elbows.", "Lead with your elbows, not your hands.", "Stop at shoulder height, then lower slowly."],
    commonMistakes: ["Swinging the weight with body momentum.", "Going too heavy — this one is built with control, not load."],
  },
  {
    slug: "tricep-pushdown", name: "Cable Tricep Pushdown", category: "isolation",
    primaryMuscles: ["triceps"], equipment: ["cable", "machine", "full gym", "resistance band"],
    formCues: ["Elbows pinned to your sides, and they stay there.", "Push down until your arms are straight, squeeze.", "Let the forearms rise back to about 90 degrees."],
    commonMistakes: ["Elbows drifting forward, turning it into a chest press."],
    harder: ["overhead-tricep-extension", "bench-dip"],
  },

  {
    slug: "knee-push-up", name: "Knee Push-Up", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Knees on a mat, ankles crossed, hands slightly wider than the shoulders.",
      "Straight line from knees to head — squeeze the glutes so the hips don't sag.",
      "Lower until your chest is a fist's height off the floor.",
      "Push the floor away and let the shoulder blades spread at the top.",
    ],
    commonMistakes: [
      "Hips sitting back toward the heels, which unloads the arms almost entirely.",
      "Lowering the head rather than the chest.",
    ],
    easier: ["incline-push-up"], harder: ["push-up"],
  },
  {
    slug: "dumbbell-floor-press", name: "Dumbbell Floor Press", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["dumbbell", "mat"],
    formCues: [
      "Lie on the floor, knees bent, dumbbells at chest level.",
      "Elbows about 45 degrees from your body, wrists stacked over elbows.",
      "Lower until your upper arms touch the floor and pause for a beat.",
      "Press up without letting the weights drift toward your face.",
    ],
    commonMistakes: [
      "Bouncing the elbows off the floor to start the press.",
      "Flaring the elbows straight out to the sides.",
    ],
    safetyNote: "The floor caps how far the shoulder can extend, which makes this the press to use when a shoulder is grumpy or you are lifting heavy without a spotter.",
    easier: ["push-up"], harder: ["dumbbell-bench-press"],
  },
  {
    slug: "incline-dumbbell-press", name: "Incline Dumbbell Press", category: "compound",
    primaryMuscles: ["chest", "shoulders", "triceps"], equipment: ["dumbbell", "bench"],
    formCues: [
      "Set the bench to about 30 degrees — steeper turns it into a shoulder press.",
      "Shoulder blades pinched back and down against the pad.",
      "Lower the weights level with your upper chest.",
      "Press up and slightly together, stopping short of clanking them.",
    ],
    commonMistakes: [
      "Bench angle too steep, so the front delts take the whole set.",
      "Letting the elbows sink far below the torso.",
    ],
    easier: ["dumbbell-bench-press"],
  },
  {
    slug: "dumbbell-chest-fly", name: "Dumbbell Chest Fly", category: "isolation",
    primaryMuscles: ["chest"], equipment: ["dumbbell", "bench", "mat"],
    formCues: [
      "Weights above your chest, palms facing each other, elbows softly bent.",
      "Open the arms out in a wide arc, holding that same elbow bend throughout.",
      "Stop when the upper arms are level with the bench and you feel the chest stretch.",
      "Squeeze the chest to bring them back together, arms staying long.",
    ],
    commonMistakes: [
      "Bending and straightening the elbows, which turns it into a clumsy press.",
      "Going deeper than chest level and hanging off the front of the shoulder.",
    ],
    safetyNote: "Flies put the shoulder in its most vulnerable position. Go lighter than feels necessary and stop the range level with the bench.",
    easier: ["band-chest-press"], harder: ["dumbbell-bench-press"],
  },
  {
    slug: "band-chest-press", name: "Band Chest Press", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["resistance band"],
    formCues: [
      "Anchor the band at chest height behind you, or run it across your upper back.",
      "Stand in a split stance so you are stable against the pull.",
      "Press the handles forward and slightly together until the arms are straight.",
      "Return slowly — the band wants to snap you back.",
    ],
    commonMistakes: [
      "Standing square and getting dragged backward mid-set.",
      "Letting the band pull the hands home fast, which throws away half the work.",
    ],
    easier: ["incline-push-up"], harder: ["push-up", "dumbbell-bench-press"],
  },
  {
    slug: "close-grip-push-up", name: "Close-Grip Push-Up", category: "compound",
    primaryMuscles: ["triceps", "chest"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Hands under your shoulders, index fingers about a thumb-width apart.",
      "Elbows stay close to your ribs the whole way down.",
      "Body in one line — glutes squeezed, ribs tucked.",
      "Lower until the chest nearly touches, then press away.",
    ],
    commonMistakes: [
      "Elbows flaring wide, which turns it back into an ordinary push-up.",
      "Hands so close together that the wrists take the strain.",
    ],
    easier: ["push-up", "incline-push-up"],
  },
  {
    slug: "incline-barbell-press", name: "Incline Barbell Press", category: "compound",
    primaryMuscles: ["chest", "shoulders", "triceps"], equipment: ["barbell", "bench", "full gym"],
    tags: ["incline barbell", "incline bench", "incline press"],
    formCues: [
      "Bench set to about 30 degrees — steeper turns it into a shoulder press.",
      "Shoulder blades pinched and driven into the bench, same as a flat press.",
      "Lower to the top of the chest, just below the collarbone.",
      "Press up and slightly back, feet driving into the floor.",
    ],
    commonMistakes: [
      "Setting the bench too upright, which takes the chest out of it.",
      "Flaring the elbows straight out to the sides.",
    ],
    safetyNote: "Use safety pins or a spotter. A failed rep on an incline still pins you.",
    easier: ["incline-dumbbell-press"], harder: ["barbell-bench-press"],
  },
  {
    slug: "barbell-bench-press", name: "Barbell Bench Press", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["barbell", "bench", "full gym"],
    formCues: [
      "Eyes under the bar, shoulder blades pinched and driven into the bench.",
      "Grip width so your forearms are vertical when the bar touches your chest.",
      "Lower to the base of your sternum with the elbows about 45 degrees out.",
      "Press back up and slightly toward your face, feet driving into the floor.",
    ],
    commonMistakes: [
      "Bouncing the bar off the chest.",
      "Letting the shoulder blades flatten out, which puts the load on the joint.",
    ],
    safetyNote: "Use safety pins or a spotter every time. A failed bench rep is the one lift that can pin you under the weight.",
    easier: ["dumbbell-bench-press"],
  },
  {
    slug: "half-kneeling-press", name: "Half-Kneeling Single-Arm Press", category: "compound",
    primaryMuscles: ["shoulders", "triceps", "core"], equipment: ["dumbbell", "kettlebell"], unilateral: true,
    formCues: [
      "Half-kneeling, front foot and back knee in line, back glute squeezed.",
      "Weight racked at the shoulder on the same side as the down knee.",
      "Brace hard and press straight up — the torso must not lean.",
      "Lower to the shoulder under control and re-set before the next rep.",
    ],
    commonMistakes: [
      "Leaning away from the weight to get it up.",
      "Ribs flaring and the lower back arching at lockout.",
    ],
    safetyNote: "Kneeling takes the lower back out of the equation, so any cheating shows up immediately. That is the point of it.",
    easier: ["dumbbell-shoulder-press"],
  },
  {
    slug: "band-overhead-press", name: "Band Overhead Press", category: "compound",
    primaryMuscles: ["shoulders", "triceps"], equipment: ["resistance band"],
    formCues: [
      "Stand on the middle of the band, handles at shoulder height, palms forward.",
      "Squeeze the glutes and brace the stomach so the back doesn't arch.",
      "Press up until the arms are almost straight — the band is hardest at the top.",
      "Lower back to shoulder height under control.",
    ],
    commonMistakes: [
      "Standing on too little band, so there is no tension at the start.",
      "Leaning back as the band gets heavier near lockout.",
    ],
    harder: ["dumbbell-shoulder-press"],
  },
  {
    slug: "pike-push-up", name: "Pike Push-Up", category: "compound",
    primaryMuscles: ["shoulders", "triceps"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "From a push-up position, walk the feet in and lift the hips into an inverted V.",
      "Hands slightly wider than the shoulders, head between the arms.",
      "Lower the crown of your head toward the floor between your hands.",
      "Press back up to straight arms.",
    ],
    commonMistakes: [
      "Hips dropping until it becomes an ordinary push-up.",
      "Lowering the face forward of the hands, which loads the shoulder awkwardly.",
    ],
    easier: ["incline-push-up", "dumbbell-shoulder-press"],
  },
  {
    slug: "overhead-tricep-extension", name: "Overhead Triceps Extension", category: "isolation",
    primaryMuscles: ["triceps"], equipment: ["dumbbell", "resistance band"],
    // What people actually call it in a gym. Searching for the name you use
    // should find the movement you mean.
    tags: ["bow extension", "skull crusher", "french press", "overhead extension", "triceps extension"],
    formCues: [
      "One dumbbell held in both hands, pressed overhead, elbows pointing forward.",
      "Lower behind your head by bending only at the elbow.",
      "Upper arms stay still and close to your ears.",
      "Extend to straight and squeeze.",
    ],
    commonMistakes: [
      "Elbows drifting wide, which takes the stretch off the triceps.",
      "Ribs flaring and the lower back arching as the weight travels back.",
    ],
    easier: ["tricep-pushdown"],
  },
  {
    slug: "bench-dip", name: "Bench Dip", category: "compound",
    primaryMuscles: ["triceps", "chest", "shoulders"], equipment: ["bench", "bodyweight"], bodyweight: true,
    formCues: [
      "Hands on the edge of a bench beside your hips, fingers pointing forward.",
      "Heels on the floor, hips staying close to the bench throughout.",
      "Lower until your upper arms are roughly level with the floor.",
      "Press back up through your palms without shrugging.",
    ],
    commonMistakes: [
      "Hips drifting away from the bench, which stresses the shoulder.",
      "Dropping much deeper than parallel.",
    ],
    safetyNote: "This puts the shoulder in an internally rotated stretch. If it pinches at the bottom, cut the range or switch to a push-up variation.",
    easier: ["tricep-pushdown"], harder: ["close-grip-push-up"],
  },

  // ── Upper body: pull ──────────────────────────────────────────────────────
  {
    slug: "lat-pulldown", name: "Lat Pulldown", category: "compound",
    primaryMuscles: ["lats", "biceps", "upper back"], equipment: ["machine", "cable", "full gym"],
    formCues: [
      "Thighs snug under the pad, hands slightly wider than shoulders.",
      "Start by pulling your shoulder blades down, then bend the elbows.",
      "Bring the bar to your upper chest, leaning back no more than about 20 degrees.",
      "Control the bar all the way back up until your arms are straight.",
    ],
    commonMistakes: ["Yanking the bar behind the neck — hard on the shoulders, no extra benefit.", "Rocking the whole torso to move the weight."],
    easier: ["band-lat-pulldown", "band-pull-apart"], harder: ["assisted-pull-up"],
  },
  {
    slug: "assisted-pull-up", name: "Assisted Pull-Up", category: "compound",
    primaryMuscles: ["lats", "biceps", "upper back"], equipment: ["machine", "resistance band", "pull-up bar"],
    formCues: ["Hands just outside shoulder width, palms forward.", "Pull your shoulder blades down before your elbows bend.", "Drive your elbows toward your ribs and bring your chin over the bar.", "Lower all the way down under control."],
    commonMistakes: ["Kipping with the legs to get up.", "Stopping halfway down and losing the best part of the rep."],
    easier: ["lat-pulldown", "negative-pull-up", "inverted-row"], harder: ["pull-up"],
  },
  {
    slug: "dumbbell-row", name: "Single-Arm Dumbbell Row", category: "compound",
    primaryMuscles: ["lats", "upper back", "biceps"], equipment: ["dumbbell", "bench"], unilateral: true,
    formCues: [
      "One knee and one hand on the bench, back flat and roughly parallel to the floor.",
      "Let the dumbbell hang and your shoulder stretch down at the bottom.",
      "Pull your elbow up and back toward your hip pocket, not straight out.",
      "Squeeze the shoulder blade at the top, then lower fully.",
    ],
    commonMistakes: ["Rotating the torso to heave the weight up.", "Shrugging the shoulder toward the ear instead of driving the elbow back."],
    easier: ["band-single-arm-row", "band-row", "seated-cable-row"], harder: ["dumbbell-bent-over-row"],
  },
  {
    slug: "seated-cable-row", name: "Seated Cable Row", category: "compound",
    primaryMuscles: ["upper back", "lats", "biceps"], equipment: ["cable", "machine", "full gym"],
    formCues: ["Slight forward lean to start, chest up, knees soft.", "Pull the handle to your belly button, elbows brushing your sides.", "Squeeze your shoulder blades together, then extend all the way forward again."],
    commonMistakes: ["Rowing with the lower back, rocking back and forth.", "Shrugging at the top."],
  },
  {
    slug: "inverted-row", name: "Inverted Row", category: "compound",
    primaryMuscles: ["upper back", "lats", "biceps"], equipment: ["bodyweight", "barbell", "smith machine"], bodyweight: true,
    formCues: ["Bar set at hip height, hang underneath with a straight body.", "Pull your chest to the bar, squeezing the shoulder blades.", "The more upright your body, the easier — walk your feet in to regress."],
    commonMistakes: ["Hips sagging so the chest never reaches the bar."],
    harder: ["negative-pull-up", "assisted-pull-up"],
  },
  {
    slug: "band-pull-apart", name: "Band Pull-Apart", category: "isolation",
    primaryMuscles: ["rear delts", "upper back"], equipment: ["resistance band"],
    formCues: ["Band at chest height, arms straight.", "Pull the band apart by squeezing your shoulder blades together.", "Slow return, keeping tension the whole way."],
    commonMistakes: ["Bending the elbows and turning it into a row."],
    harder: ["rear-delt-fly", "face-pull"],
  },
  {
    slug: "face-pull", name: "Cable Face Pull", category: "isolation",
    primaryMuscles: ["rear delts", "upper back", "rotator cuff"], equipment: ["cable", "resistance band", "full gym"],
    formCues: ["Rope set at face height.", "Pull toward your forehead, splitting the rope apart.", "Finish with your hands beside your ears and thumbs pointing back."],
    commonMistakes: ["Going too heavy and turning it into an upright row."],
    safetyNote: "One of the best counterweights to a desk-bound posture. Worth doing even on days it isn't programmed.",
    easier: ["band-external-rotation", "band-pull-apart"],
  },
  {
    slug: "bicep-curl", name: "Dumbbell Bicep Curl", category: "isolation",
    primaryMuscles: ["biceps"], equipment: ["dumbbell", "resistance band"],
    formCues: ["Elbows at your sides, palms forward.", "Curl without letting the elbows drift forward.", "Lower all the way down — the stretched position builds the arm."],
    commonMistakes: ["Swinging the torso to start each rep.", "Stopping halfway down."],
    harder: ["hammer-curl"],
  },

  {
    slug: "band-lat-pulldown", name: "Band Lat Pulldown", category: "compound",
    primaryMuscles: ["lats", "upper back", "biceps"], equipment: ["resistance band"],
    formCues: [
      "Anchor the band overhead — a door anchor or something solid above head height.",
      "Kneel or sit far enough back that the band is tight with the arms straight up.",
      "Pull your shoulder blades down first, then drive the elbows toward your ribs.",
      "Let the arms straighten fully at the top of every rep.",
    ],
    commonMistakes: [
      "Leaning back and rowing instead of pulling down.",
      "Letting the band snap the arms back up between reps.",
    ],
    easier: ["band-pull-apart"], harder: ["lat-pulldown", "assisted-pull-up"],
  },
  {
    slug: "band-row", name: "Seated Band Row", category: "compound",
    primaryMuscles: ["upper back", "lats", "biceps"], equipment: ["resistance band"],
    formCues: [
      "Sit with the legs straight and the band looped around your feet, or anchor it at chest height.",
      "Sit tall — the torso stays still while the arms work.",
      "Pull the handles to your belly, elbows brushing past your sides.",
      "Squeeze the shoulder blades together, then extend the arms all the way out.",
    ],
    commonMistakes: [
      "Rocking back and forth to move the band.",
      "Shrugging the shoulders toward the ears at the finish.",
    ],
    easier: ["band-pull-apart"], harder: ["dumbbell-row", "inverted-row"],
  },
  {
    slug: "band-single-arm-row", name: "Single-Arm Band Row", category: "compound",
    primaryMuscles: ["lats", "upper back", "biceps"], equipment: ["resistance band"], unilateral: true,
    formCues: [
      "Anchor the band at chest height and stand in a split stance, opposite foot forward.",
      "Start with the arm straight and let the shoulder reach forward.",
      "Pull the elbow back toward your hip pocket with the torso square.",
      "Return slowly and let the shoulder blade travel forward again.",
    ],
    commonMistakes: [
      "Rotating the torso open to steal extra range.",
      "Pulling the elbow out wide instead of back.",
    ],
    easier: ["band-row"], harder: ["dumbbell-row"],
  },
  {
    slug: "chest-supported-row", name: "Chest-Supported Dumbbell Row", category: "compound",
    primaryMuscles: ["upper back", "lats", "rear delts"], equipment: ["dumbbell", "bench"],
    formCues: [
      "Set a bench to about 30 degrees and lie face down with your chest on the pad.",
      "Let the dumbbells hang straight down, arms long.",
      "Row the elbows up and back, squeezing the shoulder blades together at the top.",
      "Lower all the way until the arms are straight again.",
    ],
    commonMistakes: [
      "Peeling the chest off the bench to heave the weight up.",
      "Elbows flared straight out, which hits the rear delts and skips the lats.",
    ],
    safetyNote: "The bench holds your torso, so the lower back does nothing. This is the row to use on days your back is tired or grumpy.",
    easier: ["band-row"], harder: ["dumbbell-bent-over-row"],
  },
  {
    slug: "dumbbell-bent-over-row", name: "Bent-Over Dumbbell Row", category: "compound",
    primaryMuscles: ["upper back", "lats", "biceps"], equipment: ["dumbbell"],
    formCues: [
      "Hinge to about 45 degrees with a flat back, knees soft, dumbbells hanging.",
      "Brace the stomach — your whole back is holding this position.",
      "Row both dumbbells toward your hips, elbows tracking close to your body.",
      "Lower fully and let the shoulder blades spread before the next rep.",
    ],
    commonMistakes: [
      "Standing up a little on every rep to help the weight.",
      "Rounding the lower back as fatigue arrives.",
    ],
    safetyNote: "Your lower back holds the position for the whole set. If it fatigues before your back muscles do, switch to the chest-supported version.",
    easier: ["chest-supported-row"],
  },
  {
    slug: "renegade-row", name: "Renegade Row", category: "compound",
    primaryMuscles: ["upper back", "core", "lats"], equipment: ["dumbbell", "mat"], unilateral: true,
    formCues: [
      "Push-up position with a hand on each dumbbell, feet wider than usual for stability.",
      "Squeeze the glutes and brace so the hips stay square to the floor.",
      "Row one dumbbell to your hip while pushing hard through the other.",
      "Set it down quietly and switch — the hips should barely move.",
    ],
    commonMistakes: [
      "Hips twisting toward the rowing side.",
      "Feet close together, which makes the anti-rotation part impossible.",
    ],
    easier: ["dumbbell-row", "plank"],
  },
  {
    slug: "dead-hang", name: "Dead Hang", category: "mobility",
    isHold: true,
    primaryMuscles: ["grip", "lats", "shoulders"], equipment: ["pull-up bar", "bodyweight"], bodyweight: true,
    formCues: [
      "Overhand grip, hands shoulder-width, feet off the floor.",
      "Let the shoulders rise toward the ears first, then gently pull them down without bending the arms.",
      "Breathe and hold; build toward 30 seconds.",
      "Step down rather than dropping off the bar.",
    ],
    commonMistakes: [
      "Gripping with the fingertips instead of wrapping the thumb around.",
      "Holding rigid and forgetting to breathe.",
    ],
    safetyNote: "Grip gives out long before anything else, which is the point — it is the cheapest grip training there is, and grip strength tracks with a lot of good health outcomes.",
    harder: ["negative-pull-up"],
  },
  {
    slug: "negative-pull-up", name: "Negative Pull-Up", category: "compound",
    primaryMuscles: ["lats", "biceps", "upper back"], equipment: ["pull-up bar", "bodyweight"], bodyweight: true,
    formCues: [
      "Step or jump up so your chin starts above the bar.",
      "Hold at the top for a beat with the shoulder blades pulled down.",
      "Lower as slowly as you can — aim for five seconds.",
      "Step back up rather than dropping off and repeating from a swing.",
    ],
    commonMistakes: [
      "Free-falling through the bottom half, which is exactly the part you are training.",
      "Doing so many that the last few become drops — three good ones beat eight sloppy ones.",
    ],
    easier: ["assisted-pull-up", "inverted-row"], harder: ["pull-up"],
  },
  {
    slug: "pull-up", name: "Pull-Up", category: "compound",
    primaryMuscles: ["lats", "biceps", "upper back"], equipment: ["pull-up bar", "bodyweight"], bodyweight: true,
    formCues: [
      "Hands just outside shoulder width, palms forward, full hang to start.",
      "Pull the shoulder blades down and back before the elbows bend.",
      "Drive the elbows toward your ribs until your chin clears the bar.",
      "Lower all the way to a straight-arm hang under control.",
    ],
    commonMistakes: [
      "Swinging the legs to generate momentum.",
      "Stopping short of a full hang at the bottom, which quietly removes the hardest part.",
    ],
    easier: ["assisted-pull-up", "negative-pull-up"],
  },
  {
    slug: "rear-delt-fly", name: "Bent-Over Reverse Fly", category: "isolation",
    primaryMuscles: ["rear delts", "upper back"], equipment: ["dumbbell", "resistance band"],
    formCues: [
      "Hinge forward to about 45 degrees, light dumbbells hanging, elbows softly bent.",
      "Lead with the elbows and open the arms out to the sides.",
      "Stop level with your shoulders and squeeze the shoulder blades together.",
      "Lower slowly — no swinging back down.",
    ],
    commonMistakes: [
      "Going heavy and turning it into a row.",
      "Standing up as you lift, using the whole body.",
    ],
    easier: ["band-pull-apart"],
  },
  {
    slug: "hammer-curl", name: "Dumbbell Hammer Curl", category: "isolation",
    primaryMuscles: ["biceps", "forearms"], equipment: ["dumbbell", "resistance band"],
    formCues: [
      "Palms facing each other, elbows pinned at your sides.",
      "Curl without letting the elbows drift forward.",
      "Squeeze at the top, then lower all the way down.",
    ],
    commonMistakes: [
      "Swinging the torso to start each rep.",
      "Letting the wrists roll so the palms turn up.",
    ],
    easier: ["bicep-curl"],
  },

  // ── Shoulder health ───────────────────────────────────────────────────────
  {
    slug: "band-external-rotation", name: "Band External Rotation", category: "isolation",
    primaryMuscles: ["rotator cuff", "rear delts"], equipment: ["resistance band"], unilateral: true,
    formCues: [
      "Anchor a light band at elbow height and stand side-on to it.",
      "Tuck a rolled towel between your elbow and your ribs and keep it there.",
      "Elbow bent at 90 degrees, rotate the forearm away from your body.",
      "Return slowly — this is a light, deliberate exercise by design.",
    ],
    commonMistakes: [
      "Using a band heavy enough that the shoulder shrugs and the elbow leaves the ribs.",
      "Rotating the whole torso instead of just the forearm.",
    ],
    safetyNote: "The rotator cuff responds to light, frequent work rather than heavy sets. Two or three sets of 15 with a band you could hold all day is the right dose.",
    harder: ["face-pull"],
  },
  {
    slug: "side-lying-external-rotation", name: "Side-Lying External Rotation", category: "isolation",
    primaryMuscles: ["rotator cuff"], equipment: ["dumbbell", "mat"], unilateral: true,
    formCues: [
      "Lie on your side with the top arm's elbow tucked into your ribs at 90 degrees.",
      "Start with the forearm resting across your stomach.",
      "Rotate the hand up toward the ceiling without the elbow moving.",
      "Lower slowly back across the body.",
    ],
    commonMistakes: [
      "Rolling the torso backward to raise the weight higher.",
      "Using a weight heavy enough that the elbow lifts off the ribs.",
    ],
    easier: ["band-external-rotation"],
  },
  {
    slug: "prone-ytw-raise", name: "Prone Y-T-W Raise", category: "isolation",
    primaryMuscles: ["rear delts", "upper back", "rotator cuff"], equipment: ["bodyweight", "dumbbell", "bench", "mat"], bodyweight: true,
    formCues: [
      "Lie face down on the floor or an incline bench, forehead resting down.",
      "Y: arms overhead at a narrow angle, thumbs up, lift a few inches.",
      "T: arms straight out to the sides, lift by squeezing the shoulder blades.",
      "W: elbows bent by your ribs, rotate the hands up and back.",
    ],
    commonMistakes: [
      "Shrugging the shoulders toward the ears instead of setting them down and back.",
      "Adding weight before you can do it cleanly with empty hands.",
    ],
    easier: ["band-pull-apart"],
  },
  {
    slug: "wall-slide", name: "Wall Slide", category: "mobility",
    primaryMuscles: ["shoulders", "upper back"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Back and head against a wall, feet a few inches out from it.",
      "Flatten the lower back by tucking the ribs down, and keep it there.",
      "Forearms on the wall, elbows at shoulder height.",
      "Slide the arms up as far as you can while wrists, elbows, and lower back all stay in contact.",
    ],
    commonMistakes: [
      "Letting the ribs flare and the back arch to gain height.",
      "Elbows peeling off the wall near the top.",
    ],
    safetyNote: "Range you get by arching the back is not shoulder range. Go only as high as the contact holds — most desk workers are surprised how low that is.",
    harder: ["prone-ytw-raise"],
  },

  // ── Loaded carries ────────────────────────────────────────────────────────
  {
    slug: "farmer-carry", name: "Farmer Carry", category: "compound",
    isHold: true,
    primaryMuscles: ["grip", "core", "upper back", "quads"], equipment: ["dumbbell", "kettlebell"],
    formCues: [
      "A dumbbell in each hand, arms hanging, shoulders pulled down and back.",
      "Stand tall with the ribs stacked over the hips — no leaning in any direction.",
      "Walk with normal-length steps and quiet feet.",
      "Set the weights down with a hinge, not a drop.",
    ],
    commonMistakes: [
      "Shrugging the shoulders up around the ears.",
      "Tiny shuffling steps to rush the distance.",
    ],
    harder: ["suitcase-carry"],
  },
  {
    slug: "suitcase-carry", name: "Suitcase Carry", category: "compound",
    isHold: true,
    primaryMuscles: ["core", "obliques", "grip"], equipment: ["dumbbell", "kettlebell"], unilateral: true,
    formCues: [
      "One weight in one hand, nothing in the other.",
      "Stand perfectly tall and resist the pull to lean toward the weight.",
      "Free arm relaxed at your side, not held out for balance.",
      "Walk the distance, then swap sides and match it exactly.",
    ],
    commonMistakes: [
      "Leaning away from the weight, which lets the obliques off the hook.",
      "Sticking the free arm out as a counterweight.",
    ],
    safetyNote: "The whole exercise is not tipping. If you cannot stay square, the weight is too heavy — this gets harder by staying upright, not by loading more.",
    easier: ["farmer-carry"], harder: ["overhead-carry"],
  },
  {
    slug: "front-rack-carry", name: "Front-Rack Carry", category: "compound",
    isHold: true,
    primaryMuscles: ["core", "upper back", "shoulders"], equipment: ["dumbbell", "kettlebell"],
    formCues: [
      "Hold the weights at chest height, elbows in and ribs tucked down.",
      "Brace hard — a front load wants to pull you into an arch.",
      "Breathe shallowly and steadily rather than holding your breath.",
      "Walk tall for distance or for time.",
    ],
    commonMistakes: [
      "Letting the lower back arch as the load fatigues you.",
      "Resting the weight on the chest and slumping around it.",
    ],
    easier: ["farmer-carry"], harder: ["overhead-carry"],
  },
  {
    slug: "overhead-carry", name: "Overhead Carry", category: "compound",
    isHold: true,
    primaryMuscles: ["shoulders", "core", "upper back"], equipment: ["dumbbell", "kettlebell"], unilateral: true,
    formCues: [
      "Press one weight overhead and lock the elbow, biceps beside your ear.",
      "Squeeze the glutes and tuck the ribs so the back doesn't arch.",
      "Eyes forward — you don't need to watch the weight.",
      "Walk slowly, and put it down before the shoulder starts wandering.",
    ],
    commonMistakes: [
      "Arching the lower back to keep the arm vertical.",
      "Letting the arm drift forward of the head.",
    ],
    safetyNote: "End the set the moment the arm can't stay stacked over the shoulder. An overhead load drifting forward is a lot of leverage on one joint.",
    easier: ["front-rack-carry", "farmer-carry"],
  },

  // ── Core ──────────────────────────────────────────────────────────────────
  {
    slug: "plank", name: "Plank", category: "core",
    isHold: true,
    primaryMuscles: ["core", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Elbows under shoulders, forearms flat.",
      "Squeeze your glutes and tuck your ribs down so your lower back flattens.",
      "One straight line from heels to head; look at the floor just past your hands.",
      "Breathe normally — if you can't, you're bracing too hard.",
    ],
    commonMistakes: ["Hips sagging into the lower back.", "Hips piked up into an easy inverted V.", "Holding your breath."],
    easier: ["bird-dog"], harder: ["plank-shoulder-tap", "hollow-hold"],
  },
  {
    slug: "side-plank", name: "Side Plank", category: "core",
    isHold: true,
    primaryMuscles: ["obliques", "core"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: ["Elbow directly under the shoulder, feet stacked or staggered.", "Lift the hips until the body is a straight line.", "Push the bottom shoulder away from the ear."],
    commonMistakes: ["Letting the hips drift backward.", "Sinking into the bottom shoulder."],
    easier: ["bird-dog"], harder: ["side-plank-hip-dip"],
  },
  {
    slug: "dead-bug", name: "Dead Bug", category: "core",
    primaryMuscles: ["core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On your back, arms straight up, knees over hips at 90 degrees.", "Press your lower back gently into the floor and keep it there.", "Slowly lower the opposite arm and leg, then return.", "The whole exercise is your back not moving."],
    commonMistakes: ["Lower back arching off the floor as the leg extends — shorten the range instead."],
    harder: ["reverse-crunch", "pallof-press", "hollow-hold"],
  },
  {
    slug: "bird-dog", name: "Bird Dog", category: "core",
    primaryMuscles: ["core", "glutes", "lower back"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On hands and knees, back flat like a table.", "Extend the opposite arm and leg until they're level with your torso.", "Pause, then return without letting the hips rotate."],
    commonMistakes: ["Lifting the leg so high the lower back arches.", "Hips twisting open."],
    harder: ["plank"],
  },
  {
    slug: "hollow-hold", name: "Hollow Body Hold", category: "core",
    isHold: true,
    primaryMuscles: ["core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On your back, press the lower back into the floor.", "Lift the shoulder blades and legs off the floor.", "Lower the legs only as far as the back stays flat."],
    commonMistakes: ["Lower back peeling off the floor — raise the legs higher to regress."],
    easier: ["dead-bug"],
  },
  {
    slug: "cable-woodchop", name: "Cable Woodchop", category: "core",
    primaryMuscles: ["obliques", "core"], equipment: ["cable", "resistance band", "full gym"], unilateral: true,
    formCues: ["Stand side-on to the anchor, arms straight.", "Rotate from your ribs and hips, not your arms.", "Pivot the back foot as you turn."],
    commonMistakes: ["Twisting through the lower back with locked hips."],
    easier: ["pallof-press"],
  },

  {
    slug: "pallof-press", name: "Pallof Press", category: "core",
    primaryMuscles: ["core", "obliques"], equipment: ["resistance band", "cable"], unilateral: true,
    formCues: [
      "Anchor a band at chest height and stand side-on, a step away so it is already tight.",
      "Hold the handle at your sternum with both hands, feet shoulder-width.",
      "Press the hands straight out and hold — the band is trying to rotate you.",
      "Bring it back to your chest without letting your shoulders turn.",
    ],
    commonMistakes: [
      "Letting the torso rotate toward the anchor as the arms extend.",
      "Standing too close, so there is no tension to resist.",
    ],
    easier: ["dead-bug"], harder: ["cable-woodchop"],
  },
  {
    slug: "plank-shoulder-tap", name: "Plank Shoulder Tap", category: "core",
    primaryMuscles: ["core", "obliques", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "High plank, hands under shoulders, feet wider than usual.",
      "Squeeze the glutes and brace so the hips stay level.",
      "Lift one hand and tap the opposite shoulder slowly.",
      "Replace it and switch — the hips should barely move.",
    ],
    commonMistakes: [
      "Hips rocking side to side with every tap.",
      "Feet close together, which makes staying level impossible.",
    ],
    easier: ["plank"],
  },
  {
    slug: "side-plank-hip-dip", name: "Side Plank Hip Dip", category: "core",
    primaryMuscles: ["obliques", "core"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "Start in a solid side plank, elbow directly under the shoulder.",
      "Lower the hip toward the floor a few inches under control.",
      "Drive it back up until the body is one straight line again.",
      "Top shoulder stays stacked over the bottom one throughout.",
    ],
    commonMistakes: [
      "Letting the hips drift backward as they lower.",
      "Dropping fast and bouncing off the floor.",
    ],
    easier: ["side-plank"],
  },
  {
    slug: "reverse-crunch", name: "Reverse Crunch", category: "core",
    primaryMuscles: ["core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "On your back, knees bent over your hips, hands flat beside you.",
      "Press your lower back into the floor and keep it there.",
      "Curl your hips off the floor toward your ribs — it is a small movement.",
      "Lower slowly without letting the feet swing.",
    ],
    commonMistakes: [
      "Swinging the legs to generate momentum.",
      "Pulling with the hip flexors so the lower back arches off the floor.",
    ],
    easier: ["dead-bug"], harder: ["hanging-knee-raise"],
  },
  {
    slug: "russian-twist", name: "Russian Twist", category: "core",
    primaryMuscles: ["obliques", "core"], equipment: ["dumbbell", "bodyweight"],
    tags: ["twist", "oblique twist", "seated twist"],
    formCues: [
      "Sit with knees bent and heels down, leaning back until you feel the middle switch on.",
      "Hold a dumbbell or plate at your chest with both hands.",
      "Rotate from the ribs, not the arms — the weight follows your chest round.",
      "Touch down beside your hip, then take it across without letting your back round.",
    ],
    commonMistakes: [
      "Swinging the arms while the torso stays still, which works nothing.",
      "Rounding the lower back as you lean — hinge from the hips and keep the chest up.",
      "Lifting the feet before the movement is solid, which turns it into a balance drill.",
    ],
    safetyNote: "Keep the feet down until you can go slowly without your back rounding.",
    easier: ["dead-bug"], harder: ["v-up"],
  },
  {
    slug: "v-up", name: "V-Up", category: "core",
    primaryMuscles: ["core", "hip flexors"], equipment: ["bodyweight", "mat", "dumbbell"], bodyweight: true,
    tags: ["v up", "vups", "jackknife", "pike crunch"],
    formCues: [
      "Lie flat, arms overhead, legs straight and together.",
      "Lift the arms and legs at the same time and meet over your hips — a V, not a crunch.",
      "Reach for your feet rather than yanking your neck forward.",
      "Lower both ends under control; touching down between reps is fine.",
    ],
    commonMistakes: [
      "Bending the knees to make the legs lighter, which shortens the movement to nothing.",
      "Throwing the arms for momentum and letting the lower back arch off the floor.",
    ],
    safetyNote: "If your lower back lifts off the floor, bend the knees or go back to a dead bug until it does not.",
    easier: ["dead-bug", "reverse-crunch"], harder: ["hanging-knee-raise"],
  },
  {
    slug: "seated-cross-punch", name: "Seated Cross Punch", category: "core",
    primaryMuscles: ["obliques", "core", "shoulders"], equipment: ["dumbbell"],
    tags: ["v sit cross jab", "cross jab", "punch", "boxer twist", "v-sit punch"],
    formCues: [
      "Sit leaning back at about forty-five degrees, heels down, a light dumbbell in each hand.",
      "Punch across your body — right hand toward the left knee — turning the ribs, not just the arm.",
      "Keep the back long: it leans, it does not round.",
      "Alternate at a pace you can hold for the whole set.",
    ],
    commonMistakes: [
      "Going heavy, which turns it into shoulders and momentum.",
      "Punching from the shoulder while the torso stays square.",
    ],
    safetyNote: "Light weights only. This is a rotation exercise wearing a boxing costume, not a pressing one.",
    easier: ["russian-twist"], harder: ["v-up"],
  },
  {
    slug: "hanging-knee-raise", name: "Hanging Knee Raise", category: "core",
    primaryMuscles: ["core", "hip flexors", "grip"], equipment: ["pull-up bar", "bodyweight"], bodyweight: true,
    formCues: [
      "Hang from a bar with the shoulders pulled down away from the ears.",
      "Tuck the ribs and stop the body swinging before the first rep.",
      "Raise the knees toward your chest by curling the pelvis up, not just lifting the thighs.",
      "Lower under control rather than swinging into the next rep.",
    ],
    commonMistakes: [
      "Using a swing at the bottom to launch each rep.",
      "Only lifting the knees while the pelvis never moves, which makes it all hip flexor.",
    ],
    easier: ["reverse-crunch", "dead-bug"],
  },
  {
    slug: "ab-wheel-rollout", name: "Ab Wheel Rollout", category: "core",
    primaryMuscles: ["core", "lats", "shoulders"], equipment: ["ab wheel", "mat"],
    formCues: [
      "Start on your knees, wheel under your shoulders, ribs tucked down.",
      "Squeeze the glutes and roll out only as far as you can keep the lower back flat.",
      "Pull yourself back with your stomach, not by yanking with the arms.",
      "Add range across weeks, not within a session.",
    ],
    commonMistakes: [
      "Rolling past the point where the back stays flat, which puts the whole load on the spine.",
      "Letting the hips pike up to make the return easier.",
    ],
    safetyNote: "Rolling out too far is the standard way people hurt their lower back with this. Put a marker on the floor and don't pass it until the current distance feels easy.",
    easier: ["plank", "dead-bug"],
  },

  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    slug: "cat-cow", name: "Cat-Cow", category: "mobility",
    primaryMuscles: ["spine", "core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On hands and knees.", "Exhale and round your spine toward the ceiling.", "Inhale and let your belly drop as your chest and tailbone lift.", "Move slowly with the breath."],
    commonMistakes: ["Rushing and only moving the lower back."],
    safetyNote: "Move within comfort — this is a warm-up for the spine, not a stretch to push into. Nothing here should pinch.",
  },
  {
    slug: "hip-flexor-stretch", name: "Half-Kneeling Hip Flexor Stretch", category: "mobility",
    primaryMuscles: ["hip flexors", "quads"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: ["Half-kneeling, back knee under or slightly behind the hip.", "Squeeze the back glute and tuck your tailbone under.", "Shift forward only after the tuck — that's where the stretch comes from."],
    commonMistakes: ["Lunging forward with an arched lower back, which stretches the spine instead of the hip."],
    safetyNote: "The single best counter to sitting all day. Two minutes a side moves the needle more than most people expect.",
  },
  {
    slug: "thoracic-rotation", name: "Open Book Thoracic Rotation", category: "mobility",
    primaryMuscles: ["upper back", "chest"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: ["Lie on your side, knees bent at 90 degrees and stacked.", "Arms straight out in front, palms together.", "Open the top arm across your body like a book, following it with your eyes.", "Keep the knees stacked and down."],
    commonMistakes: ["Letting the knees roll open, which turns it into a lower-back twist."],
    safetyNote: "Rotation comes from the upper back. If you feel it in the lower back instead, bend the knees more and keep them stacked.",
  },
  {
    slug: "downward-dog", name: "Downward Dog", category: "mobility",
    primaryMuscles: ["hamstrings", "calves", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["From hands and knees, lift the hips up and back.", "Bend the knees as much as needed to get a long, flat back.", "Press the floor away through your hands."],
    commonMistakes: ["Forcing straight legs and rounding the back instead."],
    safetyNote: "Bend the knees as much as you need to keep a long back. Straight legs at the cost of a rounded spine is the wrong trade.",
  },
  {
    slug: "ankle-mobilization", name: "Knee-to-Wall Ankle Mobilization", category: "mobility",
    primaryMuscles: ["ankles", "calves"], equipment: ["bodyweight"], bodyweight: true, unilateral: true,
    formCues: ["Foot a few inches from a wall.", "Drive the knee forward over the toes to touch the wall, heel stays down.", "Back the foot up until it's just barely reachable, then work there."],
    commonMistakes: ["Letting the heel lift or the arch collapse inward."],
    safetyNote: "Tight ankles are a common reason squat depth feels blocked and heels lift. Worth two minutes before every leg day.",
  },

  {
    slug: "90-90-hip-switch", name: "90/90 Hip Switch", category: "mobility",
    primaryMuscles: ["hips", "glutes"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Sit with one leg bent in front at 90 degrees and the other bent out to the side at 90.",
      "Sit tall — prop on your hands behind you at first if you need to.",
      "Lift both knees and rotate them across to the other side, keeping the feet where they are.",
      "Move slowly and pause on each side.",
    ],
    commonMistakes: [
      "Rounding the back and collapsing over the front leg.",
      "Forcing range the hip won't give — work in the range you have.",
    ],
    safetyNote: "Hip sockets vary enormously in shape. Some people will never sit flat in this position, and that is anatomy rather than tightness.",
  },
  {
    slug: "worlds-greatest-stretch", name: "World's Greatest Stretch", category: "mobility",
    primaryMuscles: ["hip flexors", "hamstrings", "upper back"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "Step into a deep lunge with the front foot outside your hand.",
      "Drop the back knee if you need to, and sink the hips forward.",
      "Place the inside hand down and rotate the other arm up toward the ceiling, eyes following it.",
      "Then straighten the front leg and hinge back for a hamstring stretch.",
    ],
    commonMistakes: [
      "Rotating from the lower back with a collapsed chest instead of turning through the upper back.",
      "Rushing through it — one slow rep per side beats six fast ones.",
    ],
    easier: ["hip-flexor-stretch"],
    safetyNote: "Pad the back knee, and go through it slowly. It covers a lot of joints at once, which is what makes it useful and what makes it easy to rush.",
  },
  {
    slug: "childs-pose", name: "Child's Pose", category: "mobility",
    primaryMuscles: ["lower back", "hips", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "From hands and knees, sit your hips back toward your heels.",
      "Knees wide, big toes together, arms reaching long in front.",
      "Let the chest sink toward the floor and breathe into your back ribs.",
      "Stay for five or six slow breaths.",
    ],
    commonMistakes: [
      "Holding tension in the shoulders instead of letting them go.",
      "Cutting it short — the release comes from time, not effort.",
    ],
    safetyNote: "Knees wider if it pinches at the front of the hips, and a cushion under the backside if the position is out of reach today.",
  },
  {
    slug: "figure-four-stretch", name: "Supine Figure-Four Stretch", category: "mobility",
    primaryMuscles: ["glutes", "hips"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "On your back, cross one ankle over the opposite knee to make a figure four.",
      "Reach through the gap and hold behind the supporting thigh.",
      "Pull the leg toward your chest until you feel it in the outside of the crossed hip.",
      "Head and shoulders stay relaxed on the floor.",
    ],
    commonMistakes: [
      "Pulling so hard the lower back peels off the floor.",
      "Letting the crossed knee drift inward instead of staying open.",
    ],
    safetyNote: "Pull behind the thigh rather than over the top of the shin, and stop short of any pinch at the front of the hip.",
  },
  {
    slug: "supine-hamstring-stretch", name: "Supine Hamstring Stretch", category: "mobility",
    primaryMuscles: ["hamstrings"], equipment: ["bodyweight", "resistance band", "mat"], bodyweight: true, unilateral: true,
    formCues: [
      "On your back, loop a band or towel around the arch of one foot.",
      "Keep the other leg bent with that foot flat on the floor.",
      "Raise the banded leg with a soft knee until you feel a stretch behind the thigh.",
      "Hold, breathe, and let it ease rather than pulling harder.",
    ],
    commonMistakes: [
      "Yanking the leg straighter than the hamstring will allow.",
      "Letting the opposite hip lift off the floor.",
    ],
    safetyNote: "Use a strap or towel rather than reaching for the foot — reaching rounds the back, which is the thing you are trying to protect.",
  },
  {
    slug: "doorway-chest-stretch", name: "Doorway Chest Stretch", category: "mobility",
    primaryMuscles: ["chest", "shoulders"], equipment: ["bodyweight"], bodyweight: true, unilateral: true,
    formCues: [
      "Forearm flat against a door frame, elbow at about shoulder height.",
      "Step the same-side foot through the doorway.",
      "Turn your chest away from the arm until you feel it across the front of the shoulder.",
      "Hold 30 seconds a side, breathing normally.",
    ],
    commonMistakes: [
      "Shrugging the shoulder up toward the ear.",
      "Pushing into a sharp pinch at the front of the joint rather than a broad stretch across the chest.",
    ],
    safetyNote: "A direct counter to a day spent hunched at a desk. Do it before pressing or pulling — a chest that won't open makes the shoulder blade do the work instead.",
  },
  {
    slug: "band-pass-through", name: "Band Shoulder Pass-Through", category: "mobility",
    primaryMuscles: ["shoulders", "chest", "upper back"], equipment: ["resistance band"],
    formCues: [
      "Hold a light band much wider than feels necessary.",
      "Arms straight, take it up over your head and down behind you.",
      "Ribs stay down so the movement comes from the shoulders, not the lower back.",
      "Narrow the grip only once the wide version feels easy.",
    ],
    commonMistakes: [
      "Gripping too narrow too soon, which forces the elbows to bend.",
      "Arching the lower back to get the band past.",
    ],
    safetyNote: "Start with the hands far wider than feels necessary and narrow them over weeks. Forcing a narrow grip is how shoulders get irritated.",
  },

  // ── Cardio ────────────────────────────────────────────────────────────────
  {
    slug: "brisk-walk", name: "Brisk Walk", category: "cardio",
    primaryMuscles: ["cardiovascular"], equipment: ["bodyweight", "outdoors"], bodyweight: true,
    formCues: ["Pace where you can talk but not comfortably sing.", "Walk tall, shoulders relaxed, arms swinging naturally.", "Aim for a continuous block rather than a stop-start stroll."],
    commonMistakes: ["Drifting to a pace that no longer raises the breath at all."],
    safetyNote: "The single most underrated tool for fat loss and health. It adds almost nothing to recovery cost, so it stacks freely on top of lifting.",
    easier: ["march-in-place"], harder: ["weighted-walk", "incline-treadmill-walk"],
  },
  {
    slug: "incline-treadmill-walk", name: "Incline Treadmill Walk", category: "cardio",
    primaryMuscles: ["cardiovascular", "glutes", "calves"], equipment: ["treadmill", "full gym"],
    formCues: ["Set an incline of 8–12% and a pace you can hold for the whole block.", "Stand tall and let go of the handrails.", "Land midfoot, don't lunge up the belt."],
    commonMistakes: ["Hanging onto the rails, which removes most of the work."],
    easier: ["brisk-walk"],
  },
  {
    slug: "stationary-bike", name: "Stationary Bike", category: "cardio",
    primaryMuscles: ["cardiovascular", "quads"], equipment: ["bike", "full gym"],
    formCues: ["Set the seat so your knee has a slight bend at the bottom of the stroke.", "Keep the resistance high enough that you aren't spinning freely.", "Relax the shoulders and grip."],
    commonMistakes: ["Seat too low, which grinds the knees."],
    harder: ["bike-intervals"],
  },
  {
    slug: "rowing-machine", name: "Rowing Machine", category: "cardio",
    primaryMuscles: ["cardiovascular", "back", "legs"], equipment: ["rower", "full gym"],
    formCues: ["The order is legs, then back, then arms.", "Reverse it on the way back: arms, back, legs.", "Finish with the handle at the bottom of your ribs, elbows past your body."],
    commonMistakes: ["Pulling with the arms first, which wastes the legs entirely.", "Rounding the back at the catch."],
    safetyNote: "Almost all rowing back pain comes from yanking with the arms and lower back instead of driving with the legs.",
  },
  {
    slug: "elliptical", name: "Elliptical", category: "cardio",
    primaryMuscles: ["cardiovascular"], equipment: ["machine", "full gym"],
    formCues: ["Stand tall, don't lean on the console.", "Use the moving handles so it's a whole-body effort.", "Resistance high enough that your legs aren't just carried by the machine."],
    commonMistakes: ["Leaning heavily on the handles and coasting."],
  },
  {
    slug: "jump-rope", name: "Jump Rope", category: "cardio",
    primaryMuscles: ["cardiovascular", "calves"], equipment: ["jump rope"], bodyweight: true,
    formCues: ["Small jumps, barely an inch off the floor.", "Turn the rope with your wrists, not your arms.", "Land softly through the balls of the feet."],
    commonMistakes: ["Jumping far higher than needed and burning out in 30 seconds."],
    safetyNote: "High impact. Skip it if you have knee, ankle, or pelvic floor issues — the bike gives the same conditioning with none of the impact.",
    easier: ["stationary-bike"],
  },
  {
    slug: "march-in-place", name: "March in Place", category: "cardio",
    primaryMuscles: ["cardiovascular"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Stand tall and drive one knee up to hip height, then the other.",
      "Swing the opposite arm with each knee.",
      "Land softly through the whole foot — no impact required.",
      "Hold a pace that lifts your breathing within a minute.",
    ],
    commonMistakes: [
      "Drifting into a slow shuffle once it gets boring.",
      "Leaning back as the knees come up.",
    ],
    safetyNote: "Zero impact and no space needed. This is the fallback when knees, weather, or a sleeping household rule out everything else.",
    harder: ["brisk-walk"],
  },
  {
    slug: "stair-intervals", name: "Stair Intervals", category: "cardio",
    primaryMuscles: ["cardiovascular", "glutes", "quads"], equipment: ["stairs"], bodyweight: true,
    formCues: [
      "Walk up at a strong pace, one stair at a time, whole foot on the step.",
      "Use the rail for balance only, not to pull yourself up.",
      "Walk down slowly and let that be your rest.",
      "Count climbs rather than watching a clock.",
    ],
    commonMistakes: [
      "Racing the descent, which is where both the falls and the sore knees come from.",
      "Going out so hard on the first climb that the rest turn into a crawl.",
    ],
    safetyNote: "Going up is the conditioning; coming down is the impact. If your knee complains, take the descent slowly or use a lift.",
    easier: ["brisk-walk"],
  },
  {
    slug: "shadow-boxing", name: "Shadow Boxing", category: "cardio",
    primaryMuscles: ["cardiovascular", "shoulders", "core"], equipment: ["bodyweight"], bodyweight: true,
    formCues: [
      "Feet staggered, hands up by your cheeks, knees soft.",
      "Rotate through the hips and torso as you punch — the arm moves last.",
      "Keep moving between punches rather than standing still.",
      "Work in rounds: two or three minutes on, a minute easy.",
    ],
    commonMistakes: [
      "Punching from a static stance, which makes it a shoulder workout instead of conditioning.",
      "Snapping the elbows into full lockout on every punch.",
    ],
    safetyNote: "With nothing to hit, a fully locked elbow takes the whole force of the punch. Keep a slight bend at the end of every one.",
    easier: ["march-in-place"],
  },
  {
    slug: "bike-intervals", name: "Bike Intervals", category: "cardio",
    primaryMuscles: ["cardiovascular", "quads", "glutes"], equipment: ["bike", "full gym"],
    formCues: [
      "Warm up easy for five minutes before the first hard effort.",
      "Work intervals should be hard enough that talking is out of the question.",
      "Recover by pedalling slowly rather than stopping dead.",
      "Start with something like six rounds of one minute hard, two minutes easy.",
    ],
    commonMistakes: [
      "Going so hard on the first interval that the rest fall apart.",
      "Cutting the recovery short, which makes the whole session moderately unpleasant instead of genuinely hard.",
    ],
    easier: ["stationary-bike"],
  },
  {
    slug: "swimming", name: "Swimming", category: "cardio",
    primaryMuscles: ["cardiovascular", "back", "shoulders"], equipment: ["pool"], bodyweight: true,
    formCues: [
      "Work in lengths with short rests rather than one continuous slog.",
      "Exhale steadily into the water instead of holding your breath.",
      "Head in line with the spine, eyes down rather than forward.",
      "Change stroke when the shoulders start to tire.",
    ],
    commonMistakes: [
      "Lifting the head to breathe, which drops the hips and doubles the effort.",
      "Treating every length as a race and stopping after four.",
    ],
    safetyNote: "No impact at all and the whole body works, which makes it the most joint-friendly conditioning available. It does very little for bone density, though — that job belongs to lifting.",
  },
  {
    slug: "weighted-walk", name: "Weighted Walk", category: "cardio",
    primaryMuscles: ["cardiovascular", "glutes", "core", "upper back"], equipment: ["backpack", "outdoors"],
    formCues: [
      "Load a backpack with about 5–10% of your body weight, sitting high on your back.",
      "Tighten the straps so nothing swings.",
      "Walk tall — the load will try to pull your shoulders forward.",
      "Add weight or add distance, never both in the same week.",
    ],
    commonMistakes: [
      "Starting far too heavy, which turns a walk into a shoulder and lower-back grind.",
      "Letting the pack sag down onto the lower back.",
    ],
    safetyNote: "Adds real work to a walk with almost none of the impact of running. Leave it out if your lower back is already irritable.",
    easier: ["brisk-walk"], harder: ["incline-treadmill-walk"],
  },
  // ── Physiotherapy stretches and rehab drills ──────────────────────────────
  // Standard, widely-prescribed movements for the complaints that actually
  // stop people training: desk neck, cranky lower backs, knees, calves and
  // wrists. Every one carries the same rule in its safety note — a stretch
  // should feel like a stretch, and sharp or radiating pain means stop and get
  // it looked at. These do not replace an assessment; they are what a
  // physiotherapist most often sends someone home with.
  {
    slug: "chin-tuck", name: "Chin Tuck", category: "mobility",
    primaryMuscles: ["deep neck flexors", "neck"], equipment: ["bodyweight", "chair"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "neck", "posture", "desk"],
    formCues: [
      "Sit or stand tall, eyes level with the horizon.",
      "Draw your chin straight back, as if making a double chin — not down toward your chest.",
      "You should feel a gentle lengthening at the base of the skull.",
      "Hold five seconds, release. Ten of those.",
    ],
    commonMistakes: [
      "Nodding the chin down instead of gliding it back — a different movement entirely.",
      "Pushing hard enough to clench the jaw. This one is deliberately small.",
    ],
    safetyNote: "The single most useful drill for a neck that aches by mid-afternoon. Dizziness or pain running into an arm means stop and get it assessed.",
    harder: ["wall-slide"],
  },
  {
    slug: "upper-trap-stretch", name: "Upper Trapezius Stretch", category: "mobility",
    primaryMuscles: ["upper traps", "neck"], equipment: ["bodyweight", "chair"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "neck", "shoulder", "desk"],
    formCues: [
      "Sit on your hand on one side to anchor that shoulder down.",
      "Tip the opposite ear toward the opposite shoulder.",
      "Add a light pull with the free hand only if you need more.",
      "Thirty seconds each side, breathing out as you settle.",
    ],
    commonMistakes: [
      "Letting the anchored shoulder ride up, which removes the stretch entirely.",
      "Rotating the head instead of tipping it sideways.",
    ],
    safetyNote: "Never pull hard on your own head. The anchor does the work, not the hand.",
  },
  {
    slug: "levator-scapulae-stretch", name: "Levator Scapulae Stretch", category: "mobility",
    primaryMuscles: ["levator scapulae", "neck"], equipment: ["bodyweight", "chair"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "neck", "shoulder"],
    formCues: [
      "Anchor one shoulder by sitting on that hand.",
      "Turn your head about 45 degrees away from that side, then look down toward your armpit.",
      "Light pressure from the free hand on the back of your head if needed.",
      "Thirty seconds each side.",
    ],
    commonMistakes: [
      "Confusing it with the upper trap stretch — this one looks down into the armpit, not sideways.",
    ],
    safetyNote: "This is the one for the knot at the top inside edge of the shoulder blade.",
  },
  {
    slug: "thread-the-needle", name: "Thread the Needle", category: "mobility",
    primaryMuscles: ["thoracic spine", "rear shoulder"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "upper back", "posture"],
    formCues: [
      "On all fours, hips over knees.",
      "Slide one arm underneath your body, palm up, until the shoulder and side of the head rest down.",
      "Keep the hips stacked over the knees rather than drifting back.",
      "Five slow breaths, then swap.",
    ],
    commonMistakes: [
      "Letting the hips sit back toward the heels, which turns it into a child's pose.",
      "Rushing. The rotation opens over several breaths, not on contact.",
    ],
    easier: ["thoracic-rotation"], harder: ["thoracic-extension-roller"],
    safetyNote: "Come out of it if the shoulder you are lying on complains — the stretch belongs in the upper back, not the shoulder joint.",
  },
  {
    slug: "thoracic-extension-roller", name: "Foam Roller Thoracic Extension", category: "mobility",
    primaryMuscles: ["thoracic spine", "upper back"], equipment: ["foam roller", "mat"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "upper back", "posture", "desk"],
    formCues: [
      "Roller across the upper back, just below the shoulder blades.",
      "Hands behind your head to support its weight, elbows toward each other.",
      "Breathe out and let the upper back drape backwards over the roller.",
      "Move the roller an inch higher and repeat, three or four positions.",
    ],
    commonMistakes: [
      "Extending from the lower back instead of the upper — ribs stay down, the movement is above them.",
      "Rolling up and down quickly. Stop at a spot and breathe instead.",
    ],
    safetyNote: "Stay above the bottom of the ribs. The lower back is not meant to extend over a roller.",
    easier: ["thread-the-needle"],
  },
  {
    slug: "pendulum-swing", name: "Shoulder Pendulum", category: "mobility",
    primaryMuscles: ["shoulder"], equipment: ["bodyweight", "chair"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "shoulder"],
    formCues: [
      "Lean forward, supporting yourself with the good arm on a chair or table.",
      "Let the sore arm hang completely dead.",
      "Move your hips to swing the arm — small circles, then side to side.",
      "Thirty seconds each direction.",
    ],
    commonMistakes: [
      "Using the shoulder muscles to move the arm. The hips swing it; the arm is a rope.",
    ],
    safetyNote: "The standard first movement after a shoulder has been sore or immobilised, precisely because the joint moves without the muscles working.",
  },
  {
    slug: "sleeper-stretch", name: "Sleeper Stretch", category: "mobility",
    primaryMuscles: ["posterior shoulder capsule"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "shoulder"],
    formCues: [
      "Lie on the side you want to stretch, shoulder under you, elbow bent to 90 degrees out in front.",
      "Roll slightly back so you are not directly on the point of the shoulder.",
      "Use the top hand to press the bottom forearm gently toward the floor.",
      "Thirty seconds, stop well short of pinching.",
    ],
    commonMistakes: [
      "Pressing until it pinches at the front of the shoulder — that is impingement, not a stretch.",
      "Lying square on the shoulder rather than rolled back a little.",
    ],
    safetyNote: "Gentle. If it pinches at the front, come off it — this stretch is easy to overdo and shoulders do not forgive it.",
  },
  {
    slug: "scapular-squeeze", name: "Scapular Squeeze", category: "mobility",
    primaryMuscles: ["mid traps", "rhomboids"], equipment: ["bodyweight", "chair"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "posture", "desk", "shoulder"],
    formCues: [
      "Sit or stand tall, arms relaxed at your sides.",
      "Draw the shoulder blades together and slightly down, as if holding a pencil between them.",
      "Hold five seconds without shrugging.",
      "Ten repetitions.",
    ],
    commonMistakes: [
      "Shrugging upward instead of squeezing back and down.",
      "Arching the lower back to fake the movement.",
    ],
    safetyNote: "Costs nothing and can be done at a desk. The antidote to a day spent reaching forward.",
    harder: ["band-pull-apart"],
  },
  {
    slug: "mckenzie-press-up", name: "Prone Press-Up", category: "mobility",
    primaryMuscles: ["lower back"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "lower back", "back pain"],
    formCues: [
      "Lie face down, hands under your shoulders.",
      "Press the upper body up while the hips stay heavy on the floor.",
      "Go only as far as is comfortable — the elbows may not straighten, and that is fine.",
      "Lower slowly. Ten repetitions.",
    ],
    commonMistakes: [
      "Lifting the hips off the floor, which turns it into a plank rather than an extension.",
      "Clenching the glutes and lower back instead of letting them relax.",
    ],
    safetyNote: "A staple for a stiff, achy lower back. If it sends pain further down a leg, stop — pain moving away from the spine is the signal to get assessed, not to push on.",
    easier: ["pelvic-tilt"], harder: ["cat-cow"],
  },
  {
    slug: "double-knee-to-chest", name: "Double Knee to Chest", category: "mobility",
    primaryMuscles: ["lower back", "glutes"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "lower back", "back pain"],
    formCues: [
      "Lie on your back, knees bent, feet flat.",
      "Bring both knees up and hold them behind the thighs.",
      "Draw them gently toward your chest until the lower back feels long.",
      "Hold twenty seconds, repeat three times.",
    ],
    commonMistakes: [
      "Gripping over the top of the shins, which cranks the knees. Hold behind the thighs instead.",
      "Lifting the head and shoulders off the floor.",
    ],
    safetyNote: "Hold behind the thighs, especially if your knees are unhappy.",
  },
  {
    slug: "supine-lumbar-rotation", name: "Supine Lower Back Rotation", category: "mobility",
    primaryMuscles: ["lower back", "obliques"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "lower back", "back pain"],
    formCues: [
      "On your back, knees bent and together, arms out in a T.",
      "Let both knees fall slowly to one side, keeping both shoulders on the floor.",
      "Turn your head the other way if it feels good.",
      "Five breaths, then the other side.",
    ],
    commonMistakes: [
      "Letting the opposite shoulder peel off the floor — the rotation should be felt, not chased.",
      "Dropping the knees fast rather than lowering them under control.",
    ],
    safetyNote: "Keep it gentle and stop short of any pinch in the lower back.",
  },
  {
    slug: "pelvic-tilt", name: "Pelvic Tilt", category: "mobility",
    primaryMuscles: ["lower back", "core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "lower back", "back pain", "core"],
    formCues: [
      "On your back, knees bent, feet flat.",
      "Flatten the lower back gently into the floor by rolling the pelvis back.",
      "Hold five seconds, then release to neutral.",
      "Ten repetitions, small and controlled.",
    ],
    commonMistakes: [
      "Pushing through the feet to lift the hips — this is a tilt, not a bridge.",
      "Holding your breath.",
    ],
    safetyNote: "The gentlest thing here. A reasonable starting point on a day when the back is too sore for anything else.",
    harder: ["glute-bridge", "dead-bug"],
  },
  {
    slug: "standing-quad-stretch", name: "Standing Quad Stretch", category: "mobility",
    primaryMuscles: ["quads", "hip flexors"], equipment: ["bodyweight", "wall"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "knee", "quad"],
    formCues: [
      "Stand tall, a hand on a wall for balance.",
      "Bend one knee and hold the ankle behind you.",
      "Tuck the tailbone under and squeeze that glute — that is what makes it work.",
      "Knees stay side by side. Thirty seconds each.",
    ],
    commonMistakes: [
      "Letting the knee drift out to the side or the back arch, which takes the stretch away.",
      "Pulling the heel hard into the backside; the tailbone tuck does more than the pull.",
    ],
    safetyNote: "Hold the ankle, not the foot, if your knee is sensitive.",
    harder: ["couch-stretch"],
  },
  {
    slug: "couch-stretch", name: "Couch Stretch", category: "mobility",
    primaryMuscles: ["hip flexors", "quads"], equipment: ["bodyweight", "mat", "wall"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "hip", "hip flexor"],
    formCues: [
      "Kneel with one shin up a wall or against a sofa, other foot planted in front.",
      "Tuck the tailbone under and stand the torso up tall.",
      "Squeeze the glute on the kneeling side.",
      "Thirty to sixty seconds each side. This one is meant to be strong.",
    ],
    commonMistakes: [
      "Arching the lower back to get upright, which is the back stretching instead of the hip.",
      "Going straight to the full version. Start with the knee further from the wall.",
    ],
    safetyNote: "Pad under the knee. Back off if the kneecap complains — the shin should take the pressure, not the kneecap.",
    easier: ["hip-flexor-stretch", "standing-quad-stretch"],
  },
  {
    slug: "frog-stretch", name: "Frog Stretch", category: "mobility",
    primaryMuscles: ["adductors", "hips"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["physio", "physiotherapy", "rehab", "hip", "groin"],
    formCues: [
      "On all fours, knees wide, insides of the shins and feet flat on the floor.",
      "Keep the back flat and rock the hips slowly backwards.",
      "Go to the first real resistance, not past it.",
      "Rock in and out ten times, then hold at the end for a few breaths.",
    ],
    commonMistakes: [
      "Rounding the lower back to get further back.",
      "Widening the knees past what the groin is ready for. This one gets sore easily.",
    ],
    safetyNote: "Pad the knees, and go up in small steps between sessions. Groin strains from over-eager frog stretches are common.",
    easier: ["90-90-hip-switch"],
  },
  {
    slug: "quad-set", name: "Quad Set", category: "mobility",
    primaryMuscles: ["quads"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "knee", "knee pain"],
    formCues: [
      "Sit with the leg straight out in front, a rolled towel under the knee.",
      "Press the back of the knee down into the towel by tightening the thigh.",
      "Hold five seconds — the heel may lift slightly.",
      "Ten repetitions each side.",
    ],
    commonMistakes: [
      "Holding the breath, which is easy on an isometric.",
      "Lifting the whole leg instead of pressing the knee down.",
    ],
    safetyNote: "Often the first exercise given after a knee problem, because it loads the quad without moving the joint at all.",
    harder: ["straight-leg-raise", "terminal-knee-extension"],
  },
  {
    slug: "straight-leg-raise", name: "Straight Leg Raise", category: "mobility",
    primaryMuscles: ["quads", "hip flexors"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "knee", "knee pain"],
    formCues: [
      "On your back, one knee bent with the foot flat, the other leg straight.",
      "Tighten the thigh of the straight leg and lock the knee.",
      "Lift it to the height of the opposite knee, slowly.",
      "Lower under control. Ten each side.",
    ],
    commonMistakes: [
      "Letting the knee bend on the way up — the locked knee is the whole point.",
      "Swinging the leg up fast and dropping it.",
    ],
    safetyNote: "Keep the other knee bent. It protects the lower back.",
    easier: ["quad-set"],
  },
  {
    slug: "heel-slide", name: "Heel Slide", category: "mobility",
    primaryMuscles: ["knee"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "knee", "knee pain"],
    formCues: [
      "Lie on your back, legs straight, on a smooth floor or with a towel under the heel.",
      "Slide the heel toward your backside, bending the knee as far as is comfortable.",
      "Hold two seconds at the end, then slide back out.",
      "Ten repetitions each side.",
    ],
    commonMistakes: [
      "Forcing past the comfortable range. Range comes back over sessions, not within one.",
    ],
    safetyNote: "The standard way to get bend back into a stiff knee. Should feel like stretch and effort, never sharp.",
  },
  {
    slug: "gastroc-calf-stretch", name: "Calf Stretch, Straight Knee", category: "mobility",
    primaryMuscles: ["calves", "gastrocnemius"], equipment: ["bodyweight", "wall"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "calf", "ankle", "achilles"],
    formCues: [
      "Hands on a wall, one foot well back.",
      "Back leg straight, heel pressed down, toes pointing forward.",
      "Lean into the wall until you feel the stretch in the upper calf.",
      "Thirty seconds each side.",
    ],
    commonMistakes: [
      "Letting the back heel lift, which ends the stretch.",
      "Turning the back foot out, which sends it to the wrong tissue.",
    ],
    harder: ["soleus-calf-stretch"],
    safetyNote: "Ease into it if the achilles has been sore. A calf stretch should pull, never sting.",
  },
  {
    slug: "soleus-calf-stretch", name: "Calf Stretch, Bent Knee", category: "mobility",
    primaryMuscles: ["calves", "soleus", "achilles"], equipment: ["bodyweight", "wall"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "calf", "ankle", "achilles"],
    formCues: [
      "Same wall position as the straight-knee version, but the back foot comes closer in.",
      "Bend the back knee while keeping that heel down.",
      "The stretch drops lower, nearer the ankle and achilles.",
      "Thirty seconds each side.",
    ],
    commonMistakes: [
      "Skipping this one. The straight-knee version misses the soleus entirely, and that is often the tight one.",
    ],
    safetyNote: "Worth doing alongside the straight-knee version rather than instead of it — they reach different muscles.",
    easier: ["gastroc-calf-stretch"],
  },
  {
    slug: "plantar-fascia-stretch", name: "Plantar Fascia Stretch", category: "mobility",
    primaryMuscles: ["foot", "plantar fascia"], equipment: ["bodyweight", "chair"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "foot", "plantar fasciitis", "heel pain"],
    formCues: [
      "Sit and cross one ankle over the opposite knee.",
      "Pull the toes back toward the shin with your hand until the arch feels taut.",
      "Run your thumb along the arch — it should feel like a tight band.",
      "Hold thirty seconds, three times each foot.",
    ],
    commonMistakes: [
      "Pulling only the big toe rather than all of them.",
    ],
    safetyNote: "Best done before the first steps of the morning, which is when plantar pain is usually worst.",
  },
  {
    slug: "wrist-flexor-stretch", name: "Wrist Flexor Stretch", category: "mobility",
    primaryMuscles: ["forearm", "wrist"], equipment: ["bodyweight"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "wrist", "forearm"],
    formCues: [
      "Arm straight out in front, palm up.",
      "With the other hand, draw the fingers down and back toward the floor.",
      "Keep the elbow straight.",
      "Thirty seconds each side.",
    ],
    commonMistakes: [
      "Bending the elbow, which slackens everything.",
    ],
    safetyNote: "Useful before pressing or carrying if your wrists complain about loaded positions.",
  },
  {
    slug: "wrist-extensor-stretch", name: "Wrist Extensor Stretch", category: "mobility",
    primaryMuscles: ["forearm", "wrist", "elbow"], equipment: ["bodyweight"], bodyweight: true, unilateral: true,
    tags: ["physio", "physiotherapy", "rehab", "wrist", "forearm", "tennis elbow", "elbow"],
    formCues: [
      "Arm straight out in front, palm down.",
      "With the other hand, draw the back of the hand down and toward you.",
      "Elbow stays straight.",
      "Thirty seconds each side.",
    ],
    commonMistakes: [
      "Rushing it. This side is usually the tighter of the two on anyone who types.",
    ],
    safetyNote: "The one that helps the outside of the elbow — tennis elbow territory. Gentle and often beats hard and occasional.",
  },
  // ── Post-partum rebuilding ────────────────────────────────────────────────
  // The standard progression a pelvic health physiotherapist works through:
  // breathe first, then coordinate the deep core with the pelvic floor, then
  // add load. It is deliberately unglamorous at the start, because the
  // foundation is what everything later is built on.
  //
  // Every entry says the same three things where they apply: wait for
  // clearance, watch the midline for doming, and heaviness or leaking means
  // stop and see a pelvic health physiotherapist rather than push on. That is
  // not boilerplate — those are the signs that separate "keep going" from
  // "get this looked at", and nobody tells you them.
  {
    slug: "diaphragmatic-breathing", name: "360 Breathing", category: "mobility",
    primaryMuscles: ["diaphragm", "deep core", "pelvic floor"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Lie on your back, knees bent, one hand on your ribs and one on your belly.",
      "Breathe in through the nose and send the air wide — ribs expand sideways and back, not just the belly up.",
      "Breathe out slowly through the mouth and feel the ribs close down.",
      "Ten slow breaths. That is the whole exercise.",
    ],
    commonMistakes: [
      "Breathing only into the belly, which misses the sideways rib expansion that actually matters.",
      "Forcing a big breath. Easy and full beats big and tense.",
    ],
    safetyNote: "This is the foundation everything else here is built on, and it is safe from very early on. Your pelvic floor lengthens as you breathe in and recoils as you breathe out — getting that rhythm back is the first job.",
    harder: ["postpartum-connection-breath"],
  },
  {
    slug: "pelvic-floor-activation", name: "Pelvic Floor Lift", category: "core",
    primaryMuscles: ["pelvic floor"], equipment: ["bodyweight", "mat", "chair"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Sitting or lying, breathe out and gently draw up as if stopping wind and then a flow of urine.",
      "The lift is forwards and upwards, and it is smaller than you expect.",
      "Hold for three to five seconds while breathing normally, then fully let go.",
      "Eight to ten lifts, once or twice a day.",
    ],
    commonMistakes: [
      "Squeezing the glutes, inner thighs or stomach instead — if anything visible moves, it is not the pelvic floor.",
      "Holding your breath, which pushes down rather than lifting up.",
      "Never fully releasing between repetitions. The letting go is half the exercise.",
    ],
    safetyNote: "Do not practise by stopping your urine mid-flow — that is a test, not an exercise, and repeating it causes problems. If you feel heaviness or dragging in the pelvis, or you leak, see a pelvic health physiotherapist: both are common and both are treatable, and neither is something to train through.",
    easier: ["diaphragmatic-breathing"], harder: ["pelvic-floor-relaxation", "tva-activation"],
  },
  {
    slug: "pelvic-floor-relaxation", name: "Pelvic Floor Release", category: "mobility",
    primaryMuscles: ["pelvic floor", "hips"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Lie with the soles of the feet together, knees falling open, or sit on a low stool with knees apart.",
      "Breathe in and picture the pelvic floor softening and widening downwards.",
      "Let the jaw unclench at the same time — the two release together.",
      "Five to ten slow breaths.",
    ],
    commonMistakes: [
      "Skipping this because lifting feels more like exercise. A pelvic floor that cannot relax is as much a problem as one that cannot lift.",
    ],
    safetyNote: "If you have pain with sitting, tampons or sex, this direction matters more than lifting — and it is worth a pelvic health physiotherapist rather than guesswork.",
    easier: ["childs-pose"],
  },
  {
    slug: "tva-activation", name: "Deep Core Draw-In", category: "core",
    primaryMuscles: ["transverse abdominis", "deep core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "On your back, knees bent, fingers just inside your hip bones.",
      "Breathe out and gently draw the lower belly in and up, as if easing into tight jeans.",
      "You should feel a light tension under your fingers, not a hard bulge.",
      "Hold five seconds, breathing. Ten repetitions.",
    ],
    commonMistakes: [
      "Sucking in hard, which recruits everything except the muscle you want.",
      "Tilting the pelvis. This is tension, not movement.",
      "Doming — a ridge appearing down the midline means back off and use less effort.",
    ],
    safetyNote: "Watch your midline. A ridge or doming along it means the effort is too much for the connective tissue right now; less is genuinely more here.",
    easier: ["diaphragmatic-breathing", "pelvic-floor-activation"], harder: ["core-heel-slide"],
  },
  {
    slug: "postpartum-connection-breath", name: "Connection Breath", category: "core",
    primaryMuscles: ["pelvic floor", "transverse abdominis", "deep core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Breathe in and let the ribs widen and the pelvic floor soften.",
      "Breathe out and let the pelvic floor lift and the lower belly draw in together.",
      "The exhale and the effort happen at the same moment — that pairing is the point.",
      "Ten breaths.",
    ],
    commonMistakes: [
      "Lifting on the in-breath, which is the opposite of what you want under load.",
      "Making it forceful. It should be barely visible from the outside.",
    ],
    safetyNote: "Exhale on effort is the rule that carries into everything else — the breath out happens as you stand up, lift the car seat, or press the weight.",
    easier: ["diaphragmatic-breathing"], harder: ["core-heel-slide", "glute-bridge"],
  },
  {
    slug: "core-heel-slide", name: "Core Heel Slide", category: "core",
    primaryMuscles: ["transverse abdominis", "deep core"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "On your back, knees bent, lower back in its natural position.",
      "Breathe out, draw the deep core in, and slide one heel away until the leg is nearly straight.",
      "Only go as far as you can keep the lower back still and the midline flat.",
      "Breathe in to bring it back. Eight each side.",
    ],
    commonMistakes: [
      "Sliding so far that the lower back arches off the floor — that range is not yours yet.",
      "Holding the breath through the slide.",
    ],
    safetyNote: "Stop the slide at the point where the midline domes or the back arches. That point moves further out over weeks, which is exactly the progress you are looking for.",
    easier: ["tva-activation"], harder: ["supine-march", "dead-bug"],
  },
  {
    slug: "supine-march", name: "Supine March", category: "core",
    primaryMuscles: ["deep core", "hip flexors"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "On your back, knees bent, feet flat, deep core gently engaged.",
      "Breathe out and lift one foot a few inches, knee staying bent.",
      "Lower it with control and swap. The pelvis does not rock.",
      "Ten each side.",
    ],
    commonMistakes: [
      "Letting the pelvis tip side to side as the foot lifts.",
      "Lifting both feet at once too early.",
    ],
    safetyNote: "If the lower back arches or the midline domes, go back to heel slides for another week or two. Nothing is lost by doing that.",
    easier: ["core-heel-slide"], harder: ["dead-bug"],
  },
  {
    slug: "wall-plank", name: "Wall Plank", category: "core",
    isHold: true,
    primaryMuscles: ["deep core", "shoulders"], equipment: ["bodyweight", "wall"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Hands on a wall at chest height, feet a step back.",
      "One straight line from head to heels, ribs down, tailbone gently tucked.",
      "Breathe out and hold the deep core lightly.",
      "Twenty to thirty seconds, breathing the whole time.",
    ],
    commonMistakes: [
      "Letting the lower back sag, which is the position a full plank punishes.",
      "Holding the breath to make it feel stronger.",
    ],
    safetyNote: "This is where plank work should start after a baby, not on the floor. A full plank too early is the classic way to make a midline gap worse.",
    harder: ["incline-plank"],
  },
  {
    slug: "incline-plank", name: "Incline Plank", category: "core",
    isHold: true,
    primaryMuscles: ["deep core", "shoulders"], equipment: ["bodyweight", "chair"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Forearms or hands on a sofa arm, worktop or stairs — the higher the surface, the easier.",
      "Straight line from head to heels, ribs down.",
      "Breathe normally throughout. Twenty to forty seconds.",
      "Lower the surface a step every week or two as it gets easy.",
    ],
    commonMistakes: [
      "Dropping to the floor as soon as the incline feels manageable, skipping the steps in between.",
      "Letting the hips pike up to take the work out of it.",
    ],
    safetyNote: "Check the midline: any doming or a visible ridge means go back up to a higher surface. Progress here is measured in weeks, and that is normal.",
    easier: ["wall-plank"], harder: ["plank"],
  },
  {
    slug: "standing-pelvic-tilt", name: "Standing Pelvic Tilt", category: "mobility",
    primaryMuscles: ["lower back", "deep core", "glutes"], equipment: ["bodyweight", "wall"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "Stand with your back against a wall, knees soft.",
      "Breathe out and gently flatten the lower back toward the wall by tucking the tailbone.",
      "Release back to neutral. Ten repetitions.",
      "Small, quiet movement — nobody watching should notice.",
    ],
    commonMistakes: [
      "Using the glutes to squeeze the hips forward rather than tilting the pelvis.",
    ],
    safetyNote: "Useful during the day, standing at the kettle or rocking a baby, when lying on the floor is not going to happen.",
    easier: ["pelvic-tilt"],
  },
  {
    slug: "happy-baby", name: "Happy Baby", category: "mobility",
    primaryMuscles: ["pelvic floor", "hips", "lower back"], equipment: ["bodyweight", "mat"], bodyweight: true,
    tags: ["postpartum", "post-partum", "postnatal", "after baby", "diastasis", "diastasis recti", "pelvic floor", "core rebuild"],
    formCues: [
      "On your back, knees drawn toward the armpits, holding the outsides of the feet or behind the thighs.",
      "Let the knees widen and the lower back settle.",
      "Breathe into the back and let the pelvic floor lengthen.",
      "Five to ten slow breaths.",
    ],
    commonMistakes: [
      "Pulling hard on the feet. Gravity does this one.",
    ],
    safetyNote: "A release, not a stretch to win. Hold behind the thighs if reaching the feet rounds your back.",
    easier: ["childs-pose"],
  },

];
