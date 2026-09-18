import Anthropic from "@anthropic-ai/sdk";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { foodEstimates, foods, mealPlans, mealTemplateItems, meals } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MODEL, PRICING } from "@/lib/agent/model";
import { checkSpendAllowed, recordUsage } from "@/lib/limits";
import { itemCount, matchScore, parsePortion, toGrams } from "@/lib/portion";
import { queryVariants } from "@/lib/search-terms";
import { foodUnitsFor } from "@/lib/profile";
import { foodLines, gramsLabel, quantityLabel } from "@/lib/food-units";
import { normaliseItem } from "@/lib/pantry";
import { pantryStock } from "@/lib/views";
import { DAY_NAMES } from "@/lib/date";
import { defineTool, type ToolContext } from "./define";

/**
 * Calorie lookup: local table first, model only on a miss.
 *
 * The common case — "100g chicken breast" — is a single indexed query: instant,
 * free, and works with no signal. Falling back to the model costs a fraction of
 * a cent and only happens for something the library does not carry.
 */

let _client: Anthropic | undefined;
const anthropic = () => (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

const scale = (per100g: number, grams: number) => Math.round((per100g * grams) / 100 * 10) / 10;

export const lookupFood = defineTool({
  name: "lookup_food",
  description:
    "Calories and macros for a food and portion — '100g boiled egg', '2 eggs', '4oz salmon'. Checks the local library first and only estimates when it finds nothing, so prefer it over working the numbers out yourself. If she gives no amount it assumes ONE of the thing — one sausage, one egg — falling back to 100g only for foods sold by weight, and `assumed` says which was filled in. Read the portion back from `portion`, which is already in her food units.",
  input: z.object({
    query: z.string().describe("Food and portion as she said it, e.g. '150g cooked rice'"),
    allowEstimate: z.boolean().optional()
      .describe("Estimate with the model when the library has no match. Default true."),
  }),
  handler: async (input, ctx) => {
    const portion = parsePortion(input.query);
    if (!portion) return { error: "Nothing to look up." };

    const matches = await searchFoods(portion.query, 5);
    const best = matches[0];

    if (best) {
      /*
        A menu item is counted, not weighed.

        Every chain publishes "1 sandwich — 520 kcal" and none publishes what
        it weighs, so these rows carry per-item figures and the only question
        is how many. A weight is refused rather than answered from a density
        nobody measured.
      */
      if (best.perItem) {
        const n = itemCount(portion, best.unitGrams, best.unitLabel);
        if (n === null) {
          return {
            found: true, food: best.name,
            error: `${best.name} is a menu item, not something sold by weight — "${portion.amount} ${portion.namedUnit ?? portion.unit}" can't be converted. Ask her how many.`,
          };
        }
        if (best.estimated) {
          void db.update(foods)
            .set({ servedCount: sql`${foods.servedCount} + 1` })
            .where(eq(foods.id, best.id))
            .catch(() => { /* a counter that fails must not fail her lookup */ });
        }
        const each = (v: number | null) => (v === null ? null : Math.round(v * n * 10) / 10);
        await record(ctx.profileId, input.query, {
          source: best.estimated ? "estimated" : "library",
          foodSlug: best.slug, components: 1, grams: best.unitGrams === null ? null : best.unitGrams * n,
          kcal: Math.round(best.kcal * n), proteinG: each(best.proteinG),
          carbsG: each(best.carbsG), fatG: each(best.fatG), fibreG: each(best.fibreG),
        });
        return {
          found: true,
          source: best.estimated ? "estimated" : "library",
          ...(best.brand ? { brand: best.brand } : {}),
          ...(best.estimated && best.note ? { note: best.note } : {}),
          food: best.name,
          category: best.category,
          // Read this back, not a weight: "1 small fries", "2 Big Macs".
          portion: n === 1 ? `1 ${best.unitLabel ?? "item"}` : `${round1(n)} × ${best.unitLabel ?? "item"}`,
          assumed: portion.assumed ? `one ${best.unitLabel ?? "item"}` : null,
          kcal: Math.round(best.kcal * n),
          proteinG: each(best.proteinG),
          carbsG: each(best.carbsG),
          fatG: each(best.fatG),
          fibreG: each(best.fibreG),
          alternatives: matches.slice(1, 4).map((m) => m.name),
        };
      }

      /*
        No amount given means *one of it*, not 100g.

        "A hot dog" is one sausage, not three and a half ounces of sausage
        meat; an egg is an egg. 100g was a safe-looking default that is wrong
        for almost everything with a natural portion — 377 of the 390 rows
        have one — and wrong in the direction that inflates her day: it read
        one hot dog as 290 kcal. Where the row has no per-item weight (rice,
        mince, anything sold by weight) 100g is still the honest fallback.
      */
      const assumedOne = portion.assumed && best.unitGrams !== null;
      const grams = assumedOne
        ? best.unitGrams!
        : toGrams(portion, best.unitGrams, best.unitLabel);
      if (grams === null) {
        /*
          A measure the library cannot convert is not an answer.

          "2 cups romaine lettuce": the library has romaine, by the heart, and
          a cup is not a heart — so this returned a refusal asking for grams.
          It did that for four of the five things in a salad, the coach asked
          her to weigh her lettuce, and nothing was logged. The model knows
          what a cup of lettuce weighs; the question goes to it. The refusal
          survives only for a caller that has said it wants no estimate.
        */
        if (input.allowEstimate !== false) return estimate(input.query, ctx, portion.query);
        return {
          found: true, food: best.name,
          // The measure she named, not the parser's word for it: the coach was
          // being told "2 named" can't be converted and repeating it to her.
          error: `${best.name} has no per-item weight, so "${portion.amount} ${portion.namedUnit ?? portion.unit}" can't be converted. Ask her for it in grams or ounces.`,
          per100g: {
          kcal: best.kcal, proteinG: best.proteinG,
          carbsG: best.carbsG, fatG: best.fatG, fibreG: best.fibreG,
        },
        };
      }
      // Counted, so the audit queue can be ordered by what is actually being
      // relied on. A guess served forty times is worth an afternoon; one
      // served once is not. Best effort and never awaited — a counter that
      // fails must not fail her lookup.
      if (best.estimated) {
        void db.update(foods)
          .set({ servedCount: sql`${foods.servedCount} + 1` })
          .where(eq(foods.id, best.id))
          .catch(() => { /* see above */ });
      }

      await record(ctx.profileId, input.query, {
        source: best.estimated ? "estimated" : "library",
        foodSlug: best.slug, components: 1, grams: Math.round(grams),
        kcal: Math.round(scale(best.kcal, grams)), proteinG: scale(best.proteinG, grams),
        carbsG: scale(best.carbsG, grams), fatG: scale(best.fatG, grams),
        fibreG: best.fibreG === null ? null : scale(best.fibreG, grams),
      });
      return {
        found: true,
        // A saved estimate is still an estimate. It is in this table so the
        // next lookup is free, not so it can pass for library data.
        source: best.estimated ? "estimated" : "library",
        ...(best.estimated && best.note ? { note: best.note } : {}),
        food: best.name,
        category: best.category,
        grams: Math.round(grams),
        // The portion as she'd say it — "3.5 oz" or "100 g". `grams` is what
        // the numbers were worked out on; this is the one to read back.
        portion: assumedOne
          ? `1 ${best.unitLabel ?? "portion"} (${gramsLabel(grams, await foodUnitsFor(ctx.profileId))})`
          : gramsLabel(grams, await foodUnitsFor(ctx.profileId)),
        // What was filled in for her, so the reply can say so. Null when she
        // gave an amount and nothing was assumed at all.
        assumed: portion.assumed ? (assumedOne ? `one ${best.unitLabel ?? "portion"}` : "100 g") : null,
        kcal: Math.round(scale(best.kcal, grams)),
        proteinG: scale(best.proteinG, grams),
        carbsG: scale(best.carbsG, grams),
        fatG: scale(best.fatG, grams),
        fibreG: best.fibreG === null ? null : scale(best.fibreG, grams),
        alternatives: matches.slice(1, 4).map((m) => m.name),
      };
    }

    if (input.allowEstimate === false) {
      await record(ctx.profileId, input.query, { source: "none" });
      return { found: false, error: `Nothing in the library matches "${portion.query}".` };
    }
    // The food without the amount, so the alias is the thing and not the
    // portion — "200g wobblecake" and "wobblecake" are one row.
    return estimate(input.query, ctx, portion.query);
  },
});

export const searchIngredient = defineTool({
  name: "search_ingredient",
  description:
    "Everything about one ingredient at once: what it is (calories and macros), whether it is in her kitchen and how much, which of this week's planned meals use it, and what else she could make with it. Use it for 'do I have any chicken?', 'what can I do with these eggs?', 'is rice worth it?' — one call instead of four. Amounts come back in her food units, and a kitchen line that says 'some' means nobody has counted it, which is not the same as having none.",
  input: z.object({
    ingredient: z.string().describe("A food, e.g. 'chicken breast' or 'eggs'"),
  }),
  handler: async (input, ctx) => {
    const term = input.ingredient.trim();
    if (!term) return { query: term, error: "Nothing to look up." };

    const fu = await foodUnitsFor(ctx.profileId);
    const name = normaliseItem(term);

    const [matches, stock, planned, recipes] = await Promise.all([
      searchFoods(term, 4),
      pantryStock(ctx.profileId),
      // This week's meals that call for it, so she can see what it is *for*
      // before deciding whether to buy or bin it.
      db.select({
        id: meals.id, title: meals.title, slot: meals.slot, dayOfWeek: meals.dayOfWeek,
        calories: meals.calories, proteinG: meals.proteinG, weekStart: mealPlans.weekStart,
      })
        .from(meals)
        .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
        .where(and(
          eq(mealPlans.profileId, ctx.profileId),
          sql`${meals.ingredients}::text ilike ${`%${term.toLowerCase()}%`}`,
        ))
        .orderBy(meals.dayOfWeek)
        .limit(8),
      findRecipes.handler({ ingredient: term, limit: 4 }, ctx) as Promise<{
        recipes: { title: string; slot: string; onHerPlan: boolean; calories: number; proteinG: number; prepMinutes: number | null }[];
      }>,
    ]);

    const best = matches[0];
    const mine = stock.filter((s) => normaliseItem(s.item) === name || normaliseItem(s.item).includes(name));

    return {
      query: term,
      foodUnits: fu,
      food: best
        ? {
            name: best.name,
            category: best.category,
            per100g: {
              kcal: best.kcal, proteinG: best.proteinG, carbsG: best.carbsG,
              fatG: best.fatG, fibreG: best.fibreG,
            },
            naturalUnit: best.unitGrams ? `${best.unitLabel} ≈ ${gramsLabel(best.unitGrams, fu)}` : null,
            alsoCalled: matches.slice(1, 4).map((m) => m.name),
          }
        : null,
      inKitchen: mine.map((s) => ({
        item: s.item,
        // Three states, never flattened: an amount, uncounted, or out.
        amount: s.amount === null ? null : quantityLabel(s.amount, s.unit, fu),
        counted: s.amount !== null,
        out: s.amount === 0,
      })),
      /** Empty means it is not in the kitchen list at all — not that she is out. */
      inKitchenMeaning: mine.length === 0
        ? "Nothing by that name is in her kitchen list. That is not the same as being out — she may simply never have logged it."
        : undefined,
      plannedThisWeek: planned.map((m) => ({
        mealId: m.id, dayName: DAY_NAMES[m.dayOfWeek], slot: m.slot, title: m.title,
        calories: m.calories, proteinG: m.proteinG, weekStart: m.weekStart,
      })),
      couldMake: recipes.recipes.filter((r) => !r.onHerPlan).slice(0, 4),
    };
  },
});

export const searchFoodLibrary = defineTool({
  name: "search_food_library",
  description:
    "Browse the food library by name. Useful when she is not sure what something is called, or to offer her options.",
  input: z.object({ query: z.string(), limit: z.number().optional() }),
  handler: async (input) => {
    const rows = await searchFoods(input.query, input.limit ?? 15);
    return rows.map((r) => ({
      name: r.name, category: r.category,
      per100g: {
        kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG,
        fatG: r.fatG, fibreG: r.fibreG,
      },
      naturalUnit: r.unitGrams ? `${r.unitLabel} ≈ ${r.unitGrams}g` : null,
    }));
  },
});

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Name and alias search, best match first. */
export async function searchFoods(query: string, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Every spelling worth trying — "hotdog", "hot dog", "hot-dog" — the same
  // way the movement picker and the coach's exercise search do it. A single
  // ILIKE on what she typed missed "Hot dog sausage" for "hotdog", so the
  // library said it had nothing and the model estimated instead: 290 kcal for
  // one sausage, against the 130 the table would have given.
  const terms = queryVariants(q);
  // …and the spelling with the spaces taken out, on both sides. "hotdog" is
  // one word to everybody who types it and two in the table, and no list of
  // variants guesses where to put the space back — squashing both and
  // comparing is the version that does not need to.
  const squashed = q.replace(/[\s-]/g, "");
  const bare = sql`lower(replace(replace(${foods.name}, ' ', ''), '-', ''))`;
  const bareAliases = sql`lower(replace(replace(${foods.aliases}::text, ' ', ''), '-', ''))`;
  const rows = await db
    .select()
    .from(foods)
    .where(or(
      ...terms.flatMap((t) => [
        ilike(foods.name, `%${t}%`),
        sql`${foods.aliases}::text ilike ${`%${t}%`}`,
      ]),
      ...(squashed.length >= 4 ? [
        sql`${bare} like ${`%${squashed}%`}`,
        sql`${bareAliases} like ${`%${squashed}%`}`,
      ] : []),
    ))
    .limit(limit * 4);

  // Rank in JS: SQL ordering can't express "closest to what she typed" without
  // a trigram index. matchScore is pure and tested — see lib/portion.ts.
  return rows
    .map((r) => ({ ...r, score: matchScore(q, r.name, r.aliases) }))
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length)
    .slice(0, limit);
}

const Estimate = z.object({
  food: z.string().describe("What this is, as she would name it"),
  /*
    Every food named, one entry each — and the reason the estimator was
    rewritten.

    "2x pork chops with rice and green beans" came back as 420 calories and
    *zero carbohydrate*: the model answered for the chops, dropped the rice and
    the beans, and nothing in the shape of the request made that impossible. A
    plate missing two of its three components is the worst kind of wrong,
    because the figure it produces looks perfectly reasonable.

    Making it enumerate is what fixes it, and it makes the answer auditable
    besides: the count is recorded with the estimate, so a guess can be read
    back against what she actually logged.
  */
  components: z.array(z.object({
    name: z.string(),
    grams: z.number(),
    kcal: z.number(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
  })).describe(
    "Every separate food named, one entry each. A plate of three things has three entries; "
    + "a single ingredient has one.",
  // Asked for, not required: an answer that forgot to enumerate one lettuce
  // is still an answer, and refusing it would leave her with nothing at all.
  ).default([]),
  grams: z.number().describe("Total grams — the sum of the components"),
  kcal: z.number().describe("Total calories — the sum of the components"),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fibreG: z.number().nullable().optional().describe("Grams of fibre, null if negligible"),
  category: z.enum([
    "meat", "fish", "dairy", "eggs", "grain", "legume", "vegetable",
    "fruit", "nut", "fat", "sauce", "drink", "snack", "prepared",
  ]).describe("Closest category for the whole thing"),
  note: z.string().optional(),
});

/**
 * What the estimator is told, and why each paragraph is there.
 *
 * It used to be three lines about "the food and portion described", which is
 * a request for one food — so a plate got answered as its most salient
 * ingredient and the rest went unmentioned. Everything below is a failure
 * somebody hit.
 */
const ESTIMATOR_SYSTEM = [
  "You estimate nutrition.",
  "",
  "What you are given may be one ingredient — '150g cooked rice' — or a whole plate:",
  "'2 pork chops with rice and green beans'. Count EVERY food named. Put each one in",
  "`components` with its own weight and macros, then make the totals the sum of them.",
  "A plate you have answered one component of is worse than no answer at all: the figure",
  "looks reasonable and is a third of what she ate.",
  "",
  "No macro may come back as zero when something named plainly carries it. Rice, bread,",
  "pasta and potatoes are carbohydrate; oil and butter are fat; meat, fish and dairy are",
  "protein. A zero there is a component you dropped.",
  "",
  "Portions: an amount she gave is exactly what she gave. '2 pork chops' is a normal chop,",
  "twice — not 200g. Where no amount is stated, assume one normal serving of each component",
  "for a meal, and 100g for a bare ingredient sold by weight.",
  "",
  "Be honest in the note when a food varies a lot by preparation or brand. A confident",
  "number for something that ranges 2x is worse than a caveat.",
].join("\n");

/** The fallback. Cheap, and only reached when the library has nothing. */
/**
 * Put an estimate in the foods table, per 100g, marked as an estimate.
 *
 * `onConflictDoNothing` rather than an update: the first answer for a name is
 * the one that stays, so a later lookup of the same food cannot silently move
 * a number she has already logged a meal against. A seeded row always wins,
 * because a real figure beats a guess — and the slug collision is what makes
 * that automatic.
 */
/**
 * An estimate as a foods row: per 100g, marked, with her wording kept.
 *
 * Pure, so the arithmetic that decides what gets written to the shared table
 * can be tested without one. Null when there is nothing to scale from — a
 * zero-gram estimate would write Infinity into every column.
 */
export function estimateRow(e: z.infer<typeof Estimate>, asked: string) {
  if (!Number.isFinite(e.grams) || e.grams <= 0) return null;
  const per100 = (n: number) => Math.round((n / e.grams) * 100 * 10) / 10;
  return {
    slug: slugify(e.food),
    name: e.food,
    category: e.category,
    kcal: per100(e.kcal),
    proteinG: per100(e.proteinG),
    carbsG: per100(e.carbsG),
    fatG: per100(e.fatG),
    fibreG: e.fibreG === null || e.fibreG === undefined ? null : per100(e.fibreG),
    // What she actually typed, as an alias.
    //
    // The cache keys on the food's *name*, and the model names things its own
    // way — "cheese quesadilla" comes back as itself and hits, but anything it
    // tidies or shortens would not, and the second lookup would pay the model
    // again for an answer already on the table. Aliases are searched; this is
    // what they are for. Left empty when it would only repeat the name.
    aliases: asked && asked.toLowerCase() !== e.food.toLowerCase() ? [asked] : [],
    estimated: true,
    note: e.note ?? null,
  };
}

/**
 * Put an estimate in the foods table.
 *
 * `onConflictDoNothing` rather than an update: the first answer for a name is
 * the one that stays, so a later lookup cannot silently move a number she has
 * already logged a meal against. A seeded row always wins for the same reason
 * — a real figure beats a guess, and the slug collision makes that automatic.
 */
async function remember(e: z.infer<typeof Estimate>, asked: string): Promise<void> {
  const row = estimateRow(e, asked);
  if (!row) return;

  /*
    A plate is not a food.

    "2x pork chops with rice and green beans" was stored as a row called *pork
    chop*, per 100g, from a figure that had counted only the chops — so a
    one-off bad answer became a library entry, and the next lookup of "pork
    chop" found it. Anything with more than one component is an answer to a
    question, not an ingredient, and answers are not cached.
  */
  if (e.components.length > 1) return;

  /*
    And never a guess for a food the library already knows.

    CLAUDE.md says a seeded row always wins because the slug collides — but
    that only holds when the model names the food the way the seed did. It
    named this one "pork chop"; the seed calls it `pork-loin-chop-cooked` and
    carries "pork chop" as an alias. No collision, so the guess (210 kcal/100g,
    no per-item weight) sat down beside the real row (231 kcal/100g, and it
    knows a chop is 120g) and outranked it on an exact name match.

    A score of 0.5 or better is an exact hit on the name or on an alias — see
    `matchScore`. Anything looser is a different food and worth keeping.
  */
  const [known] = await searchFoods(e.food, 1);
  if (known && !known.estimated && matchScore(e.food, known.name, known.aliases) <= 0.5) return;

  await db.insert(foods).values(row).onConflictDoNothing({ target: foods.slug });
}

/**
 * Every answer this tool gives, written down.
 *
 * "you better start recording the result every time someone clicks calculate
 * so that we can audit the predictions and improve them." `foods.served_count`
 * already says which guesses are leaned on; this says what each one actually
 * *said*, so a wrong one can be found after the fact rather than by somebody
 * noticing a plate came back at 420 calories.
 *
 * Best effort and never awaited, the same rule the serve counter follows: a
 * record that fails to write must not fail the lookup she is waiting on.
 */
async function record(
  profileId: string,
  query: string,
  row: {
    source: "library" | "estimated" | "none";
    foodSlug?: string | null;
    components?: number | null;
    grams?: number | null;
    kcal?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
    fibreG?: number | null;
    error?: string | null;
  },
): Promise<void> {
  /*
    Awaited, not fired and forgotten. This ran as `void db.insert(...)` and
    the row was never a sure thing: the platform freezes the function the
    moment the response goes out, and an insert still in the air went with
    it. Library hits — the fastest path, response ready the instant the row
    is found — were the ones lost, which is exactly the half of the audit
    trail that says what the library answered. The lookup that started this
    ("5x pieces of pizza, 2100 calories") has no row at all.
  */
  await db.insert(foodEstimates).values({
    profileId,
    // Her wording, before the portion parser touched it. The parse is half of
    // what goes wrong, so a record of the tidied version would hide it.
    query: query.slice(0, 500),
    source: row.source,
    foodSlug: row.foodSlug ?? null,
    components: row.components ?? null,
    grams: row.grams ?? null,
    kcal: row.kcal ?? null,
    proteinG: row.proteinG ?? null,
    carbsG: row.carbsG ?? null,
    fatG: row.fatG ?? null,
    fibreG: row.fibreG ?? null,
    error: row.error ?? null,
  }).catch(() => { /* see above */ });
}

/** Lower-case, hyphenated, the same shape the seed uses. */
const slugify = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

async function estimate(query: string, ctx: ToolContext, portionQuery = query) {
  try {
    // Gated before the call, like every other model call. This one was
    // recording its usage and checking nothing, and lookup_food is reachable
    // in a loop from /api/action — so it was the way past the daily cap.
    const budget = await checkSpendAllowed(ctx.profileId);
    if (!budget.allowed) {
      await record(ctx.profileId, query, { source: "none", error: `spend gate: ${budget.reason}` });
      return { found: false, error: budget.reason, code: budget.code };
    }

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: ESTIMATOR_SYSTEM,
      tools: [{
        name: "emit_estimate",
        description: "Emit the estimate.",
        input_schema: z.toJSONSchema(Estimate, { target: "draft-7", io: "input" }) as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: "emit_estimate" },
      messages: [{ role: "user", content: query }],
    });

    await recordUsage(response.usage, "app", PRICING, ctx.profileId);

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const parsed = block && Estimate.safeParse(block.input);
    if (!parsed?.success) {
      // Recorded with the schema's own complaint, so a refused answer is a
      // row with a reason rather than a lookup that never happened.
      await record(ctx.profileId, query, {
        source: "none",
        error: block
          ? `schema: ${(parsed && !parsed.success ? parsed.error.issues : []).map((i) => `${i.path.join(".")} ${i.message}`).join("; ").slice(0, 300)}`
          : "model returned no estimate",
      });
      return { found: false, error: "Couldn't estimate that one." };
    }

    // Kept, so the same question is not paid for twice.
    //
    // Every lookup of a food the library has never heard of costs a model
    // call, and the foods people eat repeat — "cheese quesadilla" on Tuesday
    // is the same arithmetic on Thursday. Stored per 100g like every other
    // row, flagged as an estimate, and with the note that explains the
    // variance, so a cache hit says exactly what the first answer said.
    //
    // Best effort: a cache that fails to write must not fail the lookup she
    // has already paid for.
    void remember(parsed.data, portionQuery).catch(() => { /* see above */ });

    await record(ctx.profileId, query, {
      source: "estimated",
      components: parsed.data.components.length,
      grams: parsed.data.grams, kcal: parsed.data.kcal,
      proteinG: parsed.data.proteinG, carbsG: parsed.data.carbsG,
      fatG: parsed.data.fatG, fibreG: parsed.data.fibreG ?? null,
    });
    return {
      found: true, source: "estimated", ...parsed.data,
      portion: gramsLabel(parsed.data.grams, await foodUnitsFor(ctx.profileId)),
    };
  } catch (err) {
    await record(ctx.profileId, query, { source: "none", error: `model: ${String((err as Error)?.message ?? err).slice(0, 300)}` });
    return { found: false, error: "Couldn't estimate that one." };
  }
}

export const findRecipes = defineTool({
  name: "find_recipes",
  description:
    "Meals that use a given ingredient, drawn from her own week first and then the recipe library. Use it when she asks what to do with something she has, or when a lookup leaves her wondering what to cook. Everything returned is already portioned with calories and protein, so it fits her targets without further maths.",
  input: z.object({
    ingredient: z.string().describe("A food, e.g. 'chicken breast' or 'eggs'"),
    limit: z.number().optional(),
  }),
  handler: async (input, ctx) => {
    const term = input.ingredient.trim().toLowerCase();
    if (!term) return { recipes: [] };
    const limit = input.limit ?? 6;

    // Her own plan first: these are meals she has already been given, so
    // suggesting one is a nudge back toward the plan rather than away from it.
    const hers = await db
      .select({
        title: meals.title, calories: meals.calories, proteinG: meals.proteinG,
        prepMinutes: meals.prepMinutes, ingredients: meals.ingredients, steps: meals.steps,
        dayOfWeek: meals.dayOfWeek, slot: meals.slot,
      })
      .from(meals)
      .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
      .where(and(
        eq(mealPlans.profileId, ctx.profileId),
        sql`${meals.ingredients}::text ilike ${`%${term}%`}`,
      ))
      .limit(limit);

    const library = await db
      .select({
        title: mealTemplateItems.title, calories: mealTemplateItems.calories,
        proteinG: mealTemplateItems.proteinG, prepMinutes: mealTemplateItems.prepMinutes,
        ingredients: mealTemplateItems.ingredients, steps: mealTemplateItems.steps,
        slot: mealTemplateItems.slot,
      })
      .from(mealTemplateItems)
      .where(sql`${mealTemplateItems.ingredients}::text ilike ${`%${term}%`}`)
      .limit(limit * 3);

    // The library repeats titles across templates; one of each is enough.
    const seen = new Set(hers.map((h) => h.title.toLowerCase()));
    const extra = library.filter((r) => {
      const key = r.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const fu = await foodUnitsFor(ctx.profileId);
    const shape = (r: {
      title: string; calories: number; proteinG: number; prepMinutes: number | null;
      ingredients: string[]; steps: string[]; slot: string;
    }, onPlan: boolean) => ({
      title: r.title, slot: r.slot, onHerPlan: onPlan,
      calories: r.calories, proteinG: r.proteinG, prepMinutes: r.prepMinutes,
      ingredients: foodLines(r.ingredients, fu), steps: foodLines(r.steps, fu),
    });

    return {
      foodUnits: fu,
      recipes: [
        ...hers.map((r) => shape(r, true)),
        ...extra.slice(0, Math.max(0, limit - hers.length)).map((r) => shape(r, false)),
      ],
    };
  },
});
