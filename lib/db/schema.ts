import {
  pgTable, uuid, text, integer, bigint, real, boolean, date, timestamp, jsonb,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";

/* ─────────────────────────── conventions ───────────────────────────
 * • Body weight, lifted weight → kilograms (real). Height → centimetres.
 *   The UI converts for display; see lib/units.ts.
 * • Day-level dates → `date` ('YYYY-MM-DD'), never a timestamp.
 * • Everything hangs off profileId so a second user is a row, not a rewrite.
 * ─────────────────────────────────────────────────────────────────── */

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * People who can sign in. Separate from `profiles`, which holds the training
 * data: an account is who you are, a profile is what you're working on.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** Stored lowercased and trimmed; the unique index is the real guarantee. */
    email: text("email").notNull(),
    name: text("name"),
    /**
     * scrypt, self-describing — see lib/password.ts. Never a plain password.
     * Null for an account invited for Google sign-in that has not set one;
     * password sign-in is simply unavailable until it does.
     */
    passwordHash: text("password_hash"),
    /**
     * Google's stable subject id, captured on first Google sign-in. Matching on
     * this rather than on email means a later address change at Google does not
     * silently create a second account.
     */
    googleSub: text("google_sub"),
    role: text("role", { enum: ["owner", "member"] }).default("member").notNull(),
    createdAt: createdAt(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Set to disable an account without deleting its history. */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    /**
     * Sessions issued before this instant are rejected. Bumping it is
     * "sign out everywhere" for one person — which the old shared passphrase
     * could only do for everyone, by rotating the server secret.
     */
    sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true })
      .defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email").on(t.email), uniqueIndex("users_google_sub").on(t.googleSub)],
);

export const profiles = pgTable("profiles", {
  id: id(),
  /** Nullable only so existing rows survive the migration that introduced
   *  accounts; every profile created from here on belongs to a user. */
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  birthYear: integer("birth_year"),
  sex: text("sex", { enum: ["female", "male", "other"] }),
  heightCm: real("height_cm"),
  startWeightKg: real("start_weight_kg"),
  goalWeightKg: real("goal_weight_kg"),
  goalDate: date("goal_date"),
  /** Why she's doing this, in her own words. The coach leans on this. */
  motivation: text("motivation"),
  activityLevel: text("activity_level", {
    enum: ["sedentary", "light", "moderate", "active", "very_active"],
  }),
  experience: text("experience", { enum: ["beginner", "returning", "intermediate", "advanced"] }),
  daysPerWeek: integer("days_per_week"),
  sessionMinutes: integer("session_minutes"),
  equipment: jsonb("equipment").$type<string[]>().default([]).notNull(),
  injuries: jsonb("injuries").$type<string[]>().default([]).notNull(),
  dietaryRestrictions: jsonb("dietary_restrictions").$type<string[]>().default([]).notNull(),
  dislikedFoods: jsonb("disliked_foods").$type<string[]>().default([]).notNull(),
  cookingSkill: text("cooking_skill", { enum: ["minimal", "comfortable", "keen"] }),
  /**
   * How the coach talks. Voice only: every rule it works to is the same in
   * all three, because the difference between an encouraging coach and a
   * blunt one is register, not whether it tells her the truth.
   */
  coachTone: text("coach_tone", { enum: ["encouraging", "plain", "hype"] })
    .default("plain").notNull(),
  /**
   * Which palette the app renders in. Null means the default; an unrecognised
   * value falls back rather than rendering unstyled — see lib/theme.ts.
   * Stored per profile, so it follows her between her phone and a laptop
   * instead of living in one browser's storage.
   */
  theme: text("theme"),
  /**
   * Coming back from childbirth. Null birth date means she has not told the
   * app she is postpartum, and everything here stays out of her way.
   *
   * `postpartumClearedAt` is the gate rather than a note: until a clinician
   * has checked her, the app does not write her a programme. See
   * lib/postpartum.ts — this is the part of the app where being wrong costs
   * years rather than a week.
   */
  postpartumBirthDate: date("postpartum_birth_date"),
  postpartumDelivery: text("postpartum_delivery", { enum: ["vaginal", "caesarean"] }),
  postpartumClearedAt: date("postpartum_cleared_at"),
  /** Roughly 450-500 kcal a day. Never a rounding error in her targets. */
  breastfeeding: boolean("breastfeeding").default(false).notNull(),
  /** Leaking, heaviness, doming, pain, bleeding — each changes what is safe. */
  postpartumSymptoms: jsonb("postpartum_symptoms").$type<string[]>().default([]).notNull(),
  /** How her body is measured — weight, height, tape. */
  units: text("units", { enum: ["imperial", "metric"] }).default("imperial").notNull(),
  /** How her food is measured — portions, ingredients, oven temperatures.
   *  Null follows `units`; set when she wants pounds on the scale and grams
   *  in the kitchen, or the other way round. */
  foodUnits: text("food_units", { enum: ["imperial", "metric"] }),
  /** IANA zone. Day-level dates are computed here, not in the server's zone.
   *  Null falls back to APP_TIMEZONE. */
  timezone: text("timezone"),
  /** Her chosen daily coach budget, in millionths of a dollar. Null means
   *  "use the configured ceiling". It can only tighten the env limit, never
   *  exceed it — see lib/limits.ts effectiveDailyLimit. */
  dailyBudgetMicros: bigint("daily_budget_micros", { mode: "number" }),
  /**
   * A planned break from the deficit, eating at maintenance, until this date.
   *
   * Its value is mostly psychological and the app should say so: the pooled
   * evidence has diet breaks roughly matching continuous dieting for body
   * composition. What they change is whether a fortnight at maintenance is
   * "a planned break" or "I fell off", and that difference decides whether
   * there is a week fifteen.
   */
  maintenanceUntil: date("maintenance_until"),
  /**
   * What she has to train with *this week* — a hotel gym, a suitcase, her
   * sister's spare room. Overrides `equipment` until the date passes, so a
   * travel week is a different plan rather than four missed sessions.
   */
  tempEquipment: jsonb("temp_equipment").$type<string[]>(),
  tempEquipmentUntil: date("temp_equipment_until"),
  /**
   * How long she wants between sets, in seconds. Null follows whatever the
   * plan says for each movement.
   *
   * Overriding matters because the number the planner writes is a reasonable
   * default and not her preference: someone training in a lunch hour wants
   * sixty seconds on everything, and someone squatting heavy wants three
   * minutes on that and ninety on the rest.
   */
  defaultRestSeconds: integer("default_rest_seconds"),
  /**
   * Per muscle group, keyed by the names in lib/muscle-groups.ts. A group
   * with no entry falls back to `defaultRestSeconds`, and then to the plan.
   * Legs and Back are the two people actually want longer.
   */
  restByGroup: jsonb("rest_by_group").$type<Record<string, number>>(),
  /**
   * The hour she wants reminding to weigh in, 0–23 in her own timezone, or
   * null for no reminder.
   *
   * An hour rather than a time because the reminder is sent by a scheduled
   * job, and a job that runs hourly cannot honour 07:42 — offering a minute
   * it will not keep is worse than offering the hour it will.
   */
  weighInReminderHour: integer("weigh_in_reminder_hour"),
  /**
   * The last day, in her timezone, she was nudged to weigh in.
   *
   * What makes one reminder a day true regardless of how often the sweep
   * runs. Hourly and once-a-day schedules then differ only in punctuality,
   * not in how many notifications she gets — which matters, because the
   * hosting plan decides the schedule and she should not.
   */
  weighInRemindedOn: date("weigh_in_reminded_on"),
  /** Set once onboarding has collected enough to generate a real plan. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /**
   * The guided plan setup — days a week, what she wants to work, what she has
   * to cook with — last run. Null means it has never been through, which is
   * what the invitation on the home screen keys off.
   */
  planSetupAt: timestamp("plan_setup_at", { withTimezone: true }),
  /** She said not now. The invitation stops; the setup itself is still there
   *  whenever she asks for it. */
  planSetupSkippedAt: timestamp("plan_setup_skipped_at", { withTimezone: true }),
  /**
   * How someone adds her as a friend: a short code she reads out or texts.
   *
   * Deliberately not her email address. Looking a person up by email would
   * make any signed-in account an oracle for "does this address have an
   * account here", and the address itself lives on `users`, which is out of
   * the model's reach on purpose. A code is deny-by-default — nobody can
   * reach her unless she hands it over — and `reset_share_code` takes it
   * back. Null until she first asks for one; minted lazily.
   */
  shareCode: text("share_code"),
  createdAt: createdAt(),
}, (t) => [
  // Nullable, and NULLs are distinct in Postgres, so every profile without a
  // code coexists happily. The uniqueness that matters is between real codes.
  uniqueIndex("profiles_share_code").on(t.shareCode),
]);

/**
 * Two people who have agreed to see each other's training.
 *
 * Symmetric by construction: one row covers the pair, and accepting it lets
 * each of them see the other. There is no one-way follow, because "she can
 * see my sessions and I cannot see hers" is a shape that invites comparison
 * without consent.
 *
 * **Training only.** What a friend can see is defined in lib/friends.ts and is
 * sessions, streak, hard sets and best lifts. Never weight, never
 * measurements, never photos, never food, never the coach conversation, never
 * an injury. Body data is the reason this app is careful, and a social feature
 * is exactly where it would leak first.
 *
 * Declining deletes the row rather than remembering a refusal. Nobody can ask
 * without a code she gave them, so the useful escape is resetting the code,
 * not keeping a permanent record of a no.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: id(),
    /** Who asked. Kept, rather than storing the pair in sorted order, because
     *  "she wants to see your training" and "you asked her" are different
     *  sentences and the screen has to say the right one. */
    requesterId: uuid("requester_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] }).default("pending").notNull(),
    createdAt: createdAt(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    // One row per ordered pair. The handler checks the other direction too, so
    // two people who both send a request end up joined rather than doubled.
    uniqueIndex("friendships_pair").on(t.requesterId, t.addresseeId),
    index("friendships_addressee").on(t.addresseeId, t.status),
    index("friendships_requester").on(t.requesterId, t.status),
  ],
);

/**
 * What she cooked in bulk and has left.
 *
 * The missing object between an ingredient and a meal. Meal plans fail for a
 * boring reason — seven cooking evenings — and the fix people actually use is
 * cooking twice and eating six times. Without somewhere to put "there are four
 * portions of the chilli in the fridge", the app cannot see that, so it keeps
 * asking her to cook and keeps building shopping lists for food she already
 * has cooked.
 *
 * It also produces the best data in the app: a portion logged from here has
 * exact macros, where a meal described in words has none.
 */
export const preppedPortions = pgTable(
  "prepped_portions",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    portionsTotal: integer("portions_total").notNull(),
    portionsLeft: integer("portions_left").notNull(),
    caloriesPerPortion: integer("calories_per_portion"),
    proteinPerPortion: integer("protein_per_portion"),
    cookedOn: date("cooked_on").notNull(),
    /** Food safety, not a guess she has to make at the fridge door. */
    keepsUntil: date("keeps_until"),
    /** The planned meal it came from, when it came from one. */
    mealId: uuid("meal_id").references(() => meals.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("prepped_portions_profile").on(t.profileId, t.portionsLeft)],
);

/**
 * Her cycle, as a symptom record — not a prescription engine.
 *
 * Two jobs, and only two. It annotates the weight trend, so a kilo and a half
 * of luteal fluid is explained rather than read as a gain — which is the
 * single most common way this kind of app tells a woman she has failed at
 * something she has not. And it lets *her* decide to move a session when she
 * feels rough.
 *
 * It deliberately does **not** drive training. The apps that prescribe by
 * phase — lift heavy in the follicular, back off in the luteal — are ahead of
 * the evidence: the umbrella reviews find no reliable effect of cycle phase on
 * strength performance or adaptation, and telling a beginner she is fragile on
 * a schedule is a real cost for a benefit nobody has demonstrated. Performance
 * tracks how she feels, which is why symptoms are what this stores.
 */
export const cycleEvents = pgTable(
  "cycle_events",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: text("kind", { enum: ["period_start", "period_end", "symptom"] }).notNull(),
    /** Free text, hers: "cramps", "wiped out", "everything hurts". */
    symptoms: jsonb("symptoms").$type<string[]>().default([]).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("cycle_events_profile_date").on(t.profileId, t.date)],
);

/**
 * Something that hurts, in her words.
 *
 * A returning lifter's most likely reason to quit is a knee or a shoulder that
 * grumbles for three weeks while the plan keeps prescribing the movement that
 * aggravates it. The value here is almost entirely in the *plan remembering* —
 * not in rehab content, which this app has no business generating.
 *
 * Severity is hers, 0-10, and it is never used to decide anything on its own:
 * it decides what to ask her next, and anything above a threshold or unresolved
 * for a fortnight gets the same answer, which is see a physiotherapist.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    /** "left knee", "lower back" — her words, not a taxonomy. */
    region: text("region").notNull(),
    severity: integer("severity"),
    /** The movement that brought it on, when there is one. */
    provokedBySlug: text("provoked_by_slug"),
    note: text("note"),
    startedOn: date("started_on").notNull(),
    resolvedOn: date("resolved_on"),
    createdAt: createdAt(),
  },
  (t) => [index("complaints_profile_open").on(t.profileId, t.resolvedOn)],
);

/**
 * Things to buy that no meal asked for — coffee, loo roll, her husband's
 * cereal. The shopping list is generated from the week's meals, so without
 * this "add coffee to the list" was a flat refusal, and the Instacart cart
 * went out missing half the shop.
 */
export const shoppingExtras = pgTable(
  "shopping_extras",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    /** Free text, as she said it: "coffee", "2 tins tomatoes". */
    item: text("item").notNull(),
    /** Null keeps it on every week's list until she takes it off. */
    weekStart: date("week_start"),
    createdAt: createdAt(),
  },
  (t) => [index("shopping_extras_profile").on(t.profileId, t.weekStart)],
);

/**
 * What is actually in her kitchen.
 *
 * The point is to know when something runs out: planned meals take from it as
 * she logs them, groceries put things back, and the shopping list stops asking
 * her to buy chicken she already has.
 *
 * `amount` is deliberately nullable and it does NOT mean zero — it means "she
 * has some of this and we do not know how much", which is the honest state
 * after a recipe line like "chicken breast" with no quantity. Zero means known
 * to be out, and an absent row means never bought. Those three are different
 * and the app must never collapse them: telling her she is out of something
 * she has is how a shopping list stops being believed.
 *
 * Quantities are stored exactly as recipes and shopping lists write them —
 * "g", "tbsp", "cans" — because a shopping list adds like with like and
 * converting to grams would produce a list nobody can take to a shop. Metric
 * throughout, like the rest of the food data; lib/food-units.ts rewrites it
 * for her kitchen at the boundary.
 */
export const pantryItems = pgTable(
  "pantry_items",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    /** Normalised (lower case, singular) so "Eggs" and "egg" are one row. */
    item: text("item").notNull(),
    /** Null = has some, amount unknown. 0 = known to be out. */
    amount: real("amount"),
    /**
     * As written on the recipe line: "g", "ml", "tbsp". The empty string is
     * "no unit" ("4 eggs") rather than NULL, because the uniqueness of
     * (profile, item, unit) is what stops every restock inserting another egg
     * row — and under Postgres's default rule two NULLs are never equal, so a
     * nullable column here would defeat the index exactly where most items
     * live. lib/pantry.ts is the only place that maps "" to null and back.
     */
    unit: text("unit").default("").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pantry_items_profile_item").on(t.profileId, t.item, t.unit)],
);

export const weighIns = pgTable(
  "weigh_ins",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("weigh_ins_profile_date").on(t.profileId, t.date)],
);

/**
 * Tape measurements, one row per site per day. Stored in centimetres like every
 * other length; the UI and tool boundary convert.
 *
 * This matters because the scale stalls during recomposition — she can be
 * losing fat and holding weight for weeks. Waist is usually the first place
 * that shows up.
 */
export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** One of lib/measurements.ts SITES — kept as text so adding a site is a
     *  code change, not a migration. */
    site: text("site").notNull(),
    valueCm: real("value_cm").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("measurements_profile_date_site").on(t.profileId, t.date, t.site),
    index("measurements_profile_site").on(t.profileId, t.site),
  ],
);

/**
 * Progress photos. The image itself lives in this row as base64 JPEG — no blob
 * store, no second service, no bill. Resized client-side to 800px on the long
 * edge at ~0.75 quality, so a photo is roughly 60–120KB of base64 text and a
 * year of weekly photos costs a few megabytes of the database.
 *
 * The client-side canvas re-encode also strips EXIF, which matters more than it
 * sounds: phone photos carry GPS coordinates of the room she took them in.
 *
 * Base64 image data must never be handed to the model — see lib/tools/photos.ts.
 */
export const photos = pgTable(
  "photos",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Front/side/back, so like is compared with like. Optional — an unlabelled
     *  photo is better than no photo. */
    pose: text("pose", { enum: ["front", "side", "back"] }),
    /** Base64 JPEG payload, without the `data:image/jpeg;base64,` prefix. */
    data: text("data").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("photos_profile_date").on(t.profileId, t.date)],
);

/** Long-term goals and the milestones that ladder up to them. */
export const goals = pgTable("goals", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["weight", "strength", "habit", "endurance", "body"] }).notNull(),
  /** Target in canonical units (kg for weight/strength, reps/minutes/sessions otherwise). */
  targetValue: real("target_value"),
  unit: text("unit"),
  targetDate: date("target_date"),
  /** For strength goals: which lift this tracks. */
  exerciseId: uuid("exercise_id").references(() => exercises.id, { onDelete: "set null" }),
  achievedAt: timestamp("achieved_at", { withTimezone: true }),
  celebrated: boolean("celebrated").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: createdAt(),
});

/** Exercise library — also the form/posture resource surface. Seeded, extensible. */
export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["compound", "isolation", "cardio", "mobility", "core"],
    }).notNull(),
    primaryMuscles: jsonb("primary_muscles").$type<string[]>().default([]).notNull(),
    /**
     * A hold rather than a count. A wall sit does not have reps, and asking
     * for eight of them is the app not understanding the movement — her words:
     * "for things such as planks or wall sits, switch to seconds instead."
     */
    isHold: boolean("is_hold").default(false).notNull(),
    /**
     * Metabolic equivalent, for estimating what a session costs. Null falls
     * back to the category default in lib/burn.ts. It is an estimate and every
     * surface that shows it says so — the app's real expenditure number is
     * measured from intake and weight change, not from this.
     */
    met: real("met"),
    /** Search terms that are not the name or a muscle — "postpartum",
     *  "diastasis", "physio". Without these the library holds exactly the
     *  right movement for a complaint and cannot be found by its name. */
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    equipment: jsonb("equipment").$type<string[]>().default([]).notNull(),
    /** Ordered setup + execution cues. Rendered as the form guide. */
    formCues: jsonb("form_cues").$type<string[]>().default([]).notNull(),
    commonMistakes: jsonb("common_mistakes").$type<string[]>().default([]).notNull(),
    /** Postural/safety note — what to stop for. */
    safetyNote: text("safety_note"),
    /** Regressions and progressions, by slug, for the agent to swap in. */
    easierAlternatives: jsonb("easier_alternatives").$type<string[]>().default([]).notNull(),
    harderAlternatives: jsonb("harder_alternatives").$type<string[]>().default([]).notNull(),
    unilateral: boolean("unilateral").default(false).notNull(),
    /** Bodyweight moves are logged by reps only. */
    bodyweight: boolean("bodyweight").default(false).notNull(),
  },
  (t) => [uniqueIndex("exercises_slug").on(t.slug)],
);

/* ── Templates ─────────────────────────────────────────────────────────────
 * Ready-made weeks, seeded as reference data like the exercise library.
 *
 * Onboarding instantiates the closest match instantly instead of waiting ~45s
 * on a model call — and it still works when the API is down or the key is out
 * of credit. The coach personalises from there, which is a better job for it
 * than producing a first draft from nothing.
 * ───────────────────────────────────────────────────────────────────────── */

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** How it is matched: sessions a week, kit needed, and who it suits. */
    daysPerWeek: integer("days_per_week").notNull(),
    equipment: jsonb("equipment").$type<string[]>().default([]).notNull(),
    experience: jsonb("experience").$type<string[]>().default([]).notNull(),
    /** Movements to avoid — matched against her logged injuries. */
    avoids: jsonb("avoids").$type<string[]>().default([]).notNull(),
    sessionMinutes: integer("session_minutes").notNull(),
  },
  (t) => [uniqueIndex("workout_templates_slug").on(t.slug)],
);

export const workoutTemplateDays = pgTable(
  "workout_template_days",
  {
    id: id(),
    templateId: uuid("template_id").notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    title: text("title").notNull(),
    focus: text("focus"),
    isRest: boolean("is_rest").default(false).notNull(),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("workout_template_days_dow").on(t.templateId, t.dayOfWeek)],
);

export const workoutTemplateExercises = pgTable(
  "workout_template_exercises",
  {
    id: id(),
    templateDayId: uuid("template_day_id").notNull()
      .references(() => workoutTemplateDays.id, { onDelete: "cascade" }),
    /** By slug, resolved against the exercise library when instantiated. */
    exerciseSlug: text("exercise_slug").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    sets: integer("sets").notNull(),
    /**
     * Fractional on purpose. A set she got seven and a half reps into is
     * seven and a half, not seven — rounding it down loses the half she did
     * and rounding it up claims one she did not.
     */
    reps: real("reps").notNull(),
    restSeconds: integer("rest_seconds").default(90).notNull(),
    notes: text("notes"),
  },
  (t) => [index("workout_template_exercises_day").on(t.templateDayId)],
);

export const mealTemplates = pgTable(
  "meal_templates",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** The calorie level the portions are written at; scaled to her target. */
    baseCalories: integer("base_calories").notNull(),
    baseProteinG: integer("base_protein_g").notNull(),
    /** e.g. ["vegetarian"]. Empty means it suits anyone with no restrictions. */
    dietaryTags: jsonb("dietary_tags").$type<string[]>().default([]).notNull(),
    cookingSkill: text("cooking_skill", { enum: ["minimal", "comfortable", "keen"] })
      .default("minimal").notNull(),
    /** Every ingredient used, so a template with a disliked food can be skipped. */
    contains: jsonb("contains").$type<string[]>().default([]).notNull(),
  },
  (t) => [uniqueIndex("meal_templates_slug").on(t.slug)],
);

export const mealTemplateItems = pgTable(
  "meal_template_items",
  {
    id: id(),
    templateId: uuid("template_id").notNull()
      .references(() => mealTemplates.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    slot: text("slot", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    title: text("title").notNull(),
    calories: integer("calories").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    ingredients: jsonb("ingredients").$type<string[]>().default([]).notNull(),
    steps: jsonb("steps").$type<string[]>().default([]).notNull(),
    prepMinutes: integer("prep_minutes"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("meal_template_items_day").on(t.templateId, t.dayOfWeek)],
);

/** One workout plan per week. `rationale` is the coach explaining itself. */
export const plans = pgTable(
  "plans",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plans_profile_week").on(t.profileId, t.weekStart)],
);

export const planDays = pgTable(
  "plan_days",
  {
    id: id(),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    /** 0 = Monday … 6 = Sunday. */
    dayOfWeek: integer("day_of_week").notNull(),
    title: text("title").notNull(),
    focus: text("focus"),
    /** Rest days keep a row so the week always renders as seven days. */
    isRest: boolean("is_rest").default(false).notNull(),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("plan_days_plan_dow").on(t.planId, t.dayOfWeek)],
);

export const planExercises = pgTable(
  "plan_exercises",
  {
    id: id(),
    planDayId: uuid("plan_day_id").notNull().references(() => planDays.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    targetSets: integer("target_sets").notNull(),
    targetReps: integer("target_reps").notNull(),
    /** For a hold: the seconds to aim for. Null for anything counted. */
    targetHoldSeconds: integer("target_hold_seconds"),
    /** Null until she has a working weight; the coach fills it from history. */
    targetWeightKg: real("target_weight_kg"),
    restSeconds: integer("rest_seconds").default(90).notNull(),
    notes: text("notes"),
  },
  (t) => [index("plan_exercises_day").on(t.planDayId)],
);

/** One row per workout she actually starts. */
export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    planDayId: uuid("plan_day_id").references(() => planDays.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    title: text("title").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** 1–5, how it felt. Drives how the coach adjusts next week. */
    feeling: integer("feeling"),
    notes: text("notes"),
  },
  (t) => [index("workouts_profile_date").on(t.profileId, t.date)],
);

/** The atom of progress tracking: one completed set. */
export const setLogs = pgTable(
  "set_logs",
  {
    id: id(),
    workoutId: uuid("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),
    /**
     * Fractional on purpose. A set she got seven and a half reps into is
     * seven and a half, not seven — rounding it down loses the half she did
     * and rounding it up claims one she did not.
     */
    reps: real("reps").notNull(),
    /**
     * How long the hold lasted, for movements that are held rather than
     * counted. When this is set, `reps` is the number of holds — usually 1 —
     * and the seconds are the thing that actually moved. Kept separate rather
     * than stuffed into reps, because "reps: 45" meaning forty-five seconds is
     * exactly the kind of number that reads wrong everywhere else in the app.
     */
    holdSeconds: integer("hold_seconds"),
    /**
     * Reps in reserve: how many more she could have done. One tap, and it is
     * what turns "3×8 @ 40kg" from a number into a signal — the same set at
     * 4 left and at 0 left are different training. Null means she did not say,
     * which is not the same as zero and must never be read as failure.
     */
    rir: integer("rir"),
    /** Null for bodyweight movements. */
    weightKg: real("weight_kg"),
    /** Rate of perceived exertion, 1–10. Optional but powers auto-progression. */
    rpe: real("rpe"),
    /**
     * Idempotency key minted by the browser when the set is performed. If a
     * request succeeds but the response is lost — the normal shape of a dropped
     * connection in a gym — the retry carries the same key and is ignored
     * instead of logging the set twice.
     */
    clientKey: text("client_key"),
    loggedAt: createdAt(),
  },
  (t) => [
    index("set_logs_exercise").on(t.exerciseId),
    index("set_logs_workout").on(t.workoutId),
    uniqueIndex("set_logs_client_key").on(t.clientKey),
  ],
);

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    calorieTarget: integer("calorie_target").notNull(),
    proteinTargetG: integer("protein_target_g").notNull(),
    carbTargetG: integer("carb_target_g"),
    fatTargetG: integer("fat_target_g"),
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meal_plans_profile_week").on(t.profileId, t.weekStart)],
);

export const meals = pgTable(
  "meals",
  {
    id: id(),
    mealPlanId: uuid("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    slot: text("slot", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    title: text("title").notNull(),
    calories: integer("calories").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    ingredients: jsonb("ingredients").$type<string[]>().default([]).notNull(),
    steps: jsonb("steps").$type<string[]>().default([]).notNull(),
    prepMinutes: integer("prep_minutes"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("meals_plan_day").on(t.mealPlanId, t.dayOfWeek)],
);

/** What she actually ate — planned meal or free text she describes to the coach. */
export const mealLogs = pgTable(
  "meal_logs",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    slot: text("slot", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    mealId: uuid("meal_id").references(() => meals.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    calories: integer("calories"),
    proteinG: integer("protein_g"),
    carbsG: integer("carbs_g"),
    fatG: integer("fat_g"),
    /** Nullable because most logs are described in words, and a sentence does
        not carry a fibre figure. Only the calculator can fill this honestly. */
    fibreG: integer("fibre_g"),
    /**
     * How the figures were arrived at. A restaurant meal is a guess with a
     * range around it, and saying so is what keeps her logging on the days
     * tracking usually breaks — which are the days the expenditure engine
     * most needs data for.
     */
    confidence: text("confidence", { enum: ["library", "estimated", "range"] }),
    /** Set only for `range`: the honest bounds around `calories`. */
    caloriesLow: integer("calories_low"),
    caloriesHigh: integer("calories_high"),
    /**
     * Idempotency, same reason as set_logs: a request that succeeds while the
     * response is lost is the normal shape of a dropped connection, and the
     * retry used to log the meal twice — and, for a planned meal, empty the
     * kitchen twice with it.
     */
    clientKey: text("client_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("meal_logs_profile_date").on(t.profileId, t.date),
    uniqueIndex("meal_logs_client_key").on(t.clientKey),
  ],
);

/**
 * Food macros per 100g, seeded as reference data like the exercise library.
 *
 * Local first so the common case — "how many calories in 100g of chicken" — is
 * instant, free, and works with no signal. Anything not in here falls back to
 * the coach, which costs a fraction of a cent and only happens on a miss.
 */
export const foods = pgTable(
  "foods",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    /** Everything is stored per 100g; portions scale from there. */
    kcal: real("kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    fibreG: real("fibre_g"),
    /** Grams in one natural unit — one egg, one slice, one medium banana. */
    unitGrams: real("unit_grams"),
    unitLabel: text("unit_label"),
    /** Alternative names, so "aubergine" finds "eggplant". */
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  },
  (t) => [uniqueIndex("foods_slug").on(t.slug), index("foods_name").on(t.name)],
);

/** Fitness factoids and sedentary-risk facts. Surfaced daily, never twice running. */
export const facts = pgTable(
  "facts",
  {
    id: id(),
    slug: text("slug").notNull(),
    category: text("category", {
      enum: ["sedentary_risk", "strength", "nutrition", "recovery", "motivation", "womens_health", "postpartum"],
    }).notNull(),
    text: text("text").notNull(),
    source: text("source"),
  },
  (t) => [uniqueIndex("facts_slug").on(t.slug)],
);

export const factViews = pgTable("fact_views", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  factId: uuid("fact_id").notNull().references(() => facts.id, { onDelete: "cascade" }),
  shownOn: date("shown_on").notNull(),
});

/**
 * Things she wants changed. Captured either from the button on every screen or
 * by the coach when she just complains mid-conversation — the second path is
 * the one that will actually get used.
 *
 * `path` records which screen she was on, because "this is confusing" is worth
 * far more when you know where she was standing.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["idea", "bug", "confusing"] }).notNull(),
    body: text("body").notNull(),
    /** Route she was on, or null when it came through the coach. */
    path: text("path"),
    status: text("status", { enum: ["new", "planned", "shipped", "declined"] })
      .default("new").notNull(),
    /** A note back to her, shown in the app — closes the loop so she keeps reporting. */
    reply: text("reply"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /**
     * She has seen that it shipped and said whether it actually fixed it.
     * Until this is set, the app shows her a small note about it — which is
     * the only way the loop closes: shipping something and never telling the
     * person who asked is how they stop asking.
     */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (t) => [index("feedback_profile_status").on(t.profileId, t.status)],
);

/**
 * Security-relevant events: who got in, who failed, what changed, what left.
 *
 * Nothing else in the app would tell you that someone spent a night guessing
 * the passphrase, or that her data was exported. Append-only by convention —
 * nothing in the app updates or deletes a row here, and it survives db:reset.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    event: text("event").notNull(),
    /** "info" for normal activity, "warn" for anything worth looking at. */
    severity: text("severity", { enum: ["info", "warn"] }).default("info").notNull(),
    /** Truncated and never joined to anything — enough to spot a pattern. */
    ip: text("ip"),
    /**
     * Roughly where the request came from — "Calgary, AB, CA".
     *
     * Read straight off the headers the platform already attaches to every
     * request, so it costs nothing and sends nothing anywhere. An address on
     * its own is unreadable; "somewhere in Alberta" is what turns a red alert
     * into "that will be Dad" without opening a terminal. City precision and
     * no finer: the latitude and longitude are in those headers too and are
     * more than anyone needs to answer that question.
     */
    location: text("location"),
    userAgent: text("user_agent"),
    /** Small structured payload. Never credentials, never her body data. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_at").on(t.at), index("audit_log_event").on(t.event, t.at)],
);

/** Full conversation history — this is the agent's memory across sessions. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    /** Anthropic content blocks, stored verbatim so tool_use/tool_result replay exactly. */
    content: jsonb("content").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_profile_created").on(t.profileId, t.createdAt)],
);

/**
 * Generic rate-limit ledger: one row per attempt, keyed by an opaque bucket
 * ("login:1.2.3.4", "chat"). Counting rows in a window is enough for a
 * single-user app and needs no external store — in-memory counters would be
 * useless on serverless, where every request may hit a fresh instance.
 */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: id(),
    bucket: text("bucket").notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rate_events_bucket_at").on(t.bucket, t.at)],
);

/**
 * Real token spend, per day, recorded from each response's usage block. This is
 * the hard stop that makes a runaway loop or a stolen session cost pennies
 * instead of a month's rent.
 */
export const usageDaily = pgTable("usage_daily", {
  id: id(),
  date: date("date").notNull(),
  /**
   * Keeps developer eval runs out of her budget. Eval spend is real and worth
   * tracking, but counting it against the ceiling that gates her coach means a
   * couple of test runs can silently switch her app off for the day.
   */
  source: text("source", { enum: ["app", "eval"] }).default("app").notNull(),
  /**
   * Whose spend this is. Null means unattributed — eval runs, which are never
   * charged to anyone. Without this the ceiling is global, and one talkative
   * account would switch the coach off for everybody.
   *
   * Cascades rather than nulling on delete: her spend record belongs with her
   * data. Nulling collided with the existing unattributed row for the same day
   * under NULLS NOT DISTINCT, which made deleting a profile fail outright — and
   * silently took db:reset down with it.
   */
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  requests: integer("requests").default(0).notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
  cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
  /** Millionths of a dollar — integer arithmetic, no float drift. */
  costMicros: bigint("cost_micros", { mode: "number" }).default(0).notNull(),
},
// Unique per person per day per source.
//
// NOTE: the live index is created with NULLS NOT DISTINCT, which Drizzle
// cannot express. Unattributed rows (eval runs whose scratch profile is
// gone) have a NULL profile_id, and under the default NULLS DISTINCT the
// upsert never matches them — every call would insert a new row instead of
// accumulating. If `db:push` ever recreates this index, restore the clause:
//   CREATE UNIQUE INDEX usage_daily_day
//     ON usage_daily (date, source, profile_id) NULLS NOT DISTINCT;
(t) => [uniqueIndex("usage_daily_day").on(t.date, t.source, t.profileId)]);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type MealTemplate = typeof mealTemplates.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type PantryItem = typeof pantryItems.$inferSelect;
export type ShoppingExtra = typeof shoppingExtras.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type CycleEvent = typeof cycleEvents.$inferSelect;
export type PreppedPortion = typeof preppedPortions.$inferSelect;
export type AuditEvent = typeof auditLog.$inferSelect;


/**
 * Where to send her a notification.
 *
 * One row per browser she has installed the app in — a phone and a laptop are
 * two subscriptions, and both are hers. The endpoint is the address the
 * browser vendor gave us and is unique by construction, so re-subscribing the
 * same browser updates rather than duplicating.
 *
 * `p256dh` and `auth` are the keys an *encrypted* payload would need. Nothing
 * sends one today — a reminder carries no data, because the notification says
 * "time to weigh in" and there is nothing about her body in that. They are
 * stored because the browser mints them with the subscription and throwing
 * them away would mean asking for permission again to ever use them.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint").on(t.endpoint),
    index("push_subscriptions_profile").on(t.profileId),
  ],
);


/**
 * Meals she eats often, kept so logging one is a tap.
 *
 * The app had two ways to reuse a meal and neither was hers to control: the
 * planner's recipes, and a strip of whatever she happened to log last week.
 * The second was removed because a rolling window is not a favourites list —
 * "hummus, ~2oz" fell off it after a fortnight, and the porridge she has
 * every single morning was never on it twice in the same form.
 *
 * The numbers are copied rather than referenced. A saved meal is a note of
 * what a portion of that food was, and if she later learns her porridge is
 * 380 rather than 350, the entries she already logged should not silently
 * change — the same reason a set log keeps the weight it was logged with.
 *
 * Calories and protein are nullable, because "leftovers" is a real thing to
 * save and carries no figures. Unknown is not zero, here as everywhere.
 */
export const savedMeals = pgTable(
  "saved_meals",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    /** Where it usually goes. She can still log it into any slot. */
    slot: text("slot", { enum: ["breakfast", "lunch", "dinner", "snack"] }).notNull(),
    description: text("description").notNull(),
    calories: integer("calories"),
    proteinG: real("protein_g"),
    fibreG: real("fibre_g"),
    /** Bumped on every log, so the ones she actually uses come first. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // One row per thing per slot. Saving the same porridge twice should be a
    // no-op, not a second chip that looks identical.
    uniqueIndex("saved_meals_unique").on(t.profileId, t.slot, t.description),
    index("saved_meals_profile").on(t.profileId, t.lastUsedAt),
  ],
);
