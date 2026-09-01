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
    /** scrypt, self-describing — see lib/password.ts. Never a plain password. */
    passwordHash: text("password_hash").notNull(),
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
  (t) => [uniqueIndex("users_email").on(t.email)],
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
  units: text("units", { enum: ["imperial", "metric"] }).default("imperial").notNull(),
  /** IANA zone. Day-level dates are computed here, not in the server's zone.
   *  Null falls back to APP_TIMEZONE. */
  timezone: text("timezone"),
  /** Her chosen daily coach budget, in millionths of a dollar. Null means
   *  "use the configured ceiling". It can only tighten the env limit, never
   *  exceed it — see lib/limits.ts effectiveDailyLimit. */
  dailyBudgetMicros: bigint("daily_budget_micros", { mode: "number" }),
  /** Set once onboarding has collected enough to generate a real plan. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
});

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
    reps: integer("reps").notNull(),
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
    createdAt: createdAt(),
  },
  (t) => [index("meal_logs_profile_date").on(t.profileId, t.date)],
);

/** Fitness factoids and sedentary-risk facts. Surfaced daily, never twice running. */
export const facts = pgTable(
  "facts",
  {
    id: id(),
    slug: text("slug").notNull(),
    category: text("category", {
      enum: ["sedentary_risk", "strength", "nutrition", "recovery", "motivation", "womens_health"],
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
   * Whose spend this is. Null means unattributed — eval runs whose scratch
   * profile has since been deleted. Without this the ceiling is global, and one
   * talkative account would switch the coach off for everybody.
   */
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
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
export type Measurement = typeof measurements.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type AuditEvent = typeof auditLog.$inferSelect;
