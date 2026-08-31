type Seed = {
  slug: string; name: string;
  category: "compound" | "isolation" | "cardio" | "mobility" | "core";
  primaryMuscles: string[]; equipment: string[];
  formCues: string[]; commonMistakes: string[]; safetyNote?: string;
  easier?: string[]; harder?: string[];
  unilateral?: boolean; bodyweight?: boolean;
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
    easier: ["bodyweight-squat", "wall-sit"], harder: ["barbell-back-squat", "bulgarian-split-squat"],
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
    easier: ["glute-bridge"], harder: ["barbell-deadlift"],
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
    easier: ["dumbbell-romanian-deadlift"], harder: [],
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
    easier: ["glute-bridge"], harder: [],
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
    harder: ["hip-thrust"],
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
    easier: ["step-up", "walking-lunge"], harder: [],
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
    easier: ["step-up"], harder: ["bulgarian-split-squat"],
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
    harder: ["bulgarian-split-squat"],
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
  },
  {
    slug: "wall-sit", name: "Wall Sit", category: "isolation",
    primaryMuscles: ["quads"], equipment: ["bodyweight"], bodyweight: true,
    formCues: ["Back flat against a wall, slide down until your thighs are parallel to the floor.", "Knees directly above ankles.", "Hold and breathe normally."],
    commonMistakes: ["Resting hands on the thighs to take the load off."],
    harder: ["bodyweight-squat"],
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
    easier: ["incline-push-up"], harder: ["dumbbell-bench-press"],
  },
  {
    slug: "incline-push-up", name: "Incline Push-Up", category: "compound",
    primaryMuscles: ["chest", "triceps", "shoulders"], equipment: ["bodyweight", "bench"], bodyweight: true,
    formCues: ["Hands on a bench, counter, or wall — the higher the surface, the easier.", "Same straight line from heels to head.", "Lower your chest to the surface with control."],
    commonMistakes: ["Letting the hips pike up to shorten the range."],
    harder: ["push-up"],
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
    easier: ["push-up"], harder: [],
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
    easier: ["lateral-raise"], harder: ["overhead-press"],
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
    easier: ["band-pull-apart"], harder: ["assisted-pull-up"],
  },
  {
    slug: "assisted-pull-up", name: "Assisted Pull-Up", category: "compound",
    primaryMuscles: ["lats", "biceps", "upper back"], equipment: ["machine", "resistance band", "pull-up bar"],
    formCues: ["Hands just outside shoulder width, palms forward.", "Pull your shoulder blades down before your elbows bend.", "Drive your elbows toward your ribs and bring your chin over the bar.", "Lower all the way down under control."],
    commonMistakes: ["Kipping with the legs to get up.", "Stopping halfway down and losing the best part of the rep."],
    easier: ["lat-pulldown", "inverted-row"],
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
    easier: ["seated-cable-row"],
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
    harder: ["assisted-pull-up"],
  },
  {
    slug: "band-pull-apart", name: "Band Pull-Apart", category: "isolation",
    primaryMuscles: ["rear delts", "upper back"], equipment: ["resistance band"],
    formCues: ["Band at chest height, arms straight.", "Pull the band apart by squeezing your shoulder blades together.", "Slow return, keeping tension the whole way."],
    commonMistakes: ["Bending the elbows and turning it into a row."],
  },
  {
    slug: "face-pull", name: "Cable Face Pull", category: "isolation",
    primaryMuscles: ["rear delts", "upper back", "rotator cuff"], equipment: ["cable", "resistance band", "full gym"],
    formCues: ["Rope set at face height.", "Pull toward your forehead, splitting the rope apart.", "Finish with your hands beside your ears and thumbs pointing back."],
    commonMistakes: ["Going too heavy and turning it into an upright row."],
    safetyNote: "One of the best counterweights to a desk-bound posture. Worth doing even on days it isn't programmed.",
  },
  {
    slug: "bicep-curl", name: "Dumbbell Bicep Curl", category: "isolation",
    primaryMuscles: ["biceps"], equipment: ["dumbbell", "resistance band"],
    formCues: ["Elbows at your sides, palms forward.", "Curl without letting the elbows drift forward.", "Lower all the way down — the stretched position builds the arm."],
    commonMistakes: ["Swinging the torso to start each rep.", "Stopping halfway down."],
  },

  // ── Core ──────────────────────────────────────────────────────────────────
  {
    slug: "plank", name: "Plank", category: "core",
    primaryMuscles: ["core", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: [
      "Elbows under shoulders, forearms flat.",
      "Squeeze your glutes and tuck your ribs down so your lower back flattens.",
      "One straight line from heels to head; look at the floor just past your hands.",
      "Breathe normally — if you can't, you're bracing too hard.",
    ],
    commonMistakes: ["Hips sagging into the lower back.", "Hips piked up into an easy inverted V.", "Holding your breath."],
    easier: ["bird-dog"], harder: ["hollow-hold"],
  },
  {
    slug: "side-plank", name: "Side Plank", category: "core",
    primaryMuscles: ["obliques", "core"], equipment: ["bodyweight", "mat"], bodyweight: true, unilateral: true,
    formCues: ["Elbow directly under the shoulder, feet stacked or staggered.", "Lift the hips until the body is a straight line.", "Push the bottom shoulder away from the ear."],
    commonMistakes: ["Letting the hips drift backward.", "Sinking into the bottom shoulder."],
    easier: ["bird-dog"],
  },
  {
    slug: "dead-bug", name: "Dead Bug", category: "core",
    primaryMuscles: ["core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On your back, arms straight up, knees over hips at 90 degrees.", "Press your lower back gently into the floor and keep it there.", "Slowly lower the opposite arm and leg, then return.", "The whole exercise is your back not moving."],
    commonMistakes: ["Lower back arching off the floor as the leg extends — shorten the range instead."],
    harder: ["hollow-hold"],
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
  },

  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    slug: "cat-cow", name: "Cat-Cow", category: "mobility",
    primaryMuscles: ["spine", "core"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["On hands and knees.", "Exhale and round your spine toward the ceiling.", "Inhale and let your belly drop as your chest and tailbone lift.", "Move slowly with the breath."],
    commonMistakes: ["Rushing and only moving the lower back."],
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
  },
  {
    slug: "downward-dog", name: "Downward Dog", category: "mobility",
    primaryMuscles: ["hamstrings", "calves", "shoulders"], equipment: ["bodyweight", "mat"], bodyweight: true,
    formCues: ["From hands and knees, lift the hips up and back.", "Bend the knees as much as needed to get a long, flat back.", "Press the floor away through your hands."],
    commonMistakes: ["Forcing straight legs and rounding the back instead."],
  },
  {
    slug: "ankle-mobilization", name: "Knee-to-Wall Ankle Mobilization", category: "mobility",
    primaryMuscles: ["ankles", "calves"], equipment: ["bodyweight"], bodyweight: true, unilateral: true,
    formCues: ["Foot a few inches from a wall.", "Drive the knee forward over the toes to touch the wall, heel stays down.", "Back the foot up until it's just barely reachable, then work there."],
    commonMistakes: ["Letting the heel lift or the arch collapse inward."],
    safetyNote: "Tight ankles are a common reason squat depth feels blocked and heels lift. Worth two minutes before every leg day.",
  },

  // ── Cardio ────────────────────────────────────────────────────────────────
  {
    slug: "brisk-walk", name: "Brisk Walk", category: "cardio",
    primaryMuscles: ["cardiovascular"], equipment: ["bodyweight", "outdoors"], bodyweight: true,
    formCues: ["Pace where you can talk but not comfortably sing.", "Walk tall, shoulders relaxed, arms swinging naturally.", "Aim for a continuous block rather than a stop-start stroll."],
    commonMistakes: ["Drifting to a pace that no longer raises the breath at all."],
    safetyNote: "The single most underrated tool for fat loss and health. It adds almost nothing to recovery cost, so it stacks freely on top of lifting.",
    harder: ["incline-treadmill-walk"],
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
];
