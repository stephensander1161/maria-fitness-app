import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { herId } from "@/lib/tools/ids";
import { registry } from "@/lib/tools";

const nutrition = fs.readFileSync("lib/tools/nutrition.ts", "utf8");

/*
  From a real transcript. Asked to correct her breakfast an hour after logging
  it, the coach no longer had the id, invented "breakfast-smoothie", and the
  correction died in the Postgres driver. She then read out the figures off six
  packets — the yogurt, the milk, the cacao nibs, the chia, the flax, the
  berries, every one exact — and was told "tap it on the Eat screen" every
  single time. Nothing she said was ever written down.
*/

suite("a meal can be corrected by the name she gives it", () => {
  it("takes the slot when there is no id", () => {
    // `correct_set` has always worked this way — with nothing but the movement
    // it corrects the most recent one — and this is the same sentence about
    // food. The slot is the handle she actually gives you.
    const tool = registry.get("update_meal_log")!;
    expect(tool.description).toMatch(/With no logId it corrects the most recent entry in that slot/);
    /*
      The whole branch, not a line out of the middle of it — the first version
      of this asserted only the `orderBy`, which survives the branch being
      switched off and so asserted nothing.
    */
    expect(nutrition).toMatch(
      /: input\.slot\s*\n\s*\? await db\.select\(\)\.from\(mealLogs\)[\s\S]{0,400}?eq\(mealLogs\.slot, input\.slot\)[\s\S]{0,200}?orderBy\(desc\(mealLogs\.createdAt\)\)/,
    );
  });

  it("says what to do instead when an id does not resolve", () => {
    // "No entry with that id" is a dead end; the way out is the slot.
    expect(nutrition).toMatch(/Pass `slot` instead and it will correct her most recent entry/);
  });
});

suite("an id the model made up is an answer, not an exception", () => {
  it("is rejected before it reaches the database", () => {
    /*
      Every one of these ends up in `eq(table.id, …)` against a uuid column,
      and Postgres raises on anything that is not one. The tool throws, the
      turn fails, and the coach reports a server problem to her. Validating at
      the boundary turns that into a sentence: `runTool` hands a rejected
      input straight back as `Invalid arguments`.
    */
    const ok = herId("get_day_nutrition").safeParse("3a090a31-f3aa-4c11-9c3e-0970461d6e9a");
    expect(ok.success).toBe(true);
    const bad = herId("get_day_nutrition").safeParse("breakfast-smoothie");
    expect(bad.success).toBe(false);
    // The message has to say where a real one comes from — "invalid uuid"
    // tells the model nothing it can use.
    expect(bad.error!.issues[0].message).toMatch(/get one from get_day_nutrition/);
  });

  it("guards every id the model is asked for, not just the one that bit", () => {
    const files = ["nutrition", "corrections", "photos", "friends", "batch-cooking", "profile"];
    for (const f of files) {
      const src = fs.readFileSync(`lib/tools/${f}.ts`, "utf8");
      for (const m of src.matchAll(/\b(logId|mealId|goalId|photoId|friendshipId|messageId): z\.string\(\)/g)) {
        expect.fail(`lib/tools/${f}.ts: ${m[0]} takes a raw string into a uuid column`);
      }
    }
  });

  it("does not pretend an id is hers", () => {
    // Validation is about the shape. Every query still scopes to her profile,
    // and that is what makes an id from anywhere else match nothing.
    expect(nutrition).toMatch(/eq\(mealLogs\.id, input\.logId\), eq\(mealLogs\.profileId, ctx\.profileId\)/);
  });
});
