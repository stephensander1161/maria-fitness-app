import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { registry } from "@/lib/tools";
import { recipePhotoDraft, tidyAssumptions } from "@/lib/agent/planner";
import { slotForHour } from "@/lib/nutrition";

const read = (p: string) => fs.readFileSync(p, "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

suite("a photo of a recipe, turned into numbers", () => {
  const tool = registry.get("estimate_recipe_from_photo")!;

  it("is registered, hidden from the model, and counted as slow", () => {
    expect(tool).toBeDefined();
    // The model cannot produce a resized JPEG, and the call is a planner-class
    // one — the turn guard admits one per turn and only early in it.
    expect(tool.uiOnly).toMatch(/cannot generate an image/);
    expect(tool.slow).toBe("planner");
  });

  it("only accepts a JPEG data URL the browser made, and refuses an oversized one", async () => {
    const ctx = { profileId: "00000000-0000-0000-0000-000000000000" };
    for (const bad of ["https://example.com/cake.jpg", "data:image/png;base64,AAAA", "not a url", ""]) {
      expect(await tool.handler({ image: bad }, ctx), bad).toMatchObject({ ok: false });
    }
    const huge = `data:image/jpeg;base64,${"A".repeat(400_001)}`;
    expect(await tool.handler({ image: huge }, ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/over the \d+KB limit/) });
  });

  it("never stores the photo and never hands it back", () => {
    const src = code("lib/tools/recipe-photo.ts");
    // No table, no blob, no second copy anywhere.
    expect(src).not.toMatch(/db\.insert|photos|blobKey|putPrivate/);
    // The return is metadata; the only place `image` appears is the input and
    // the call itself.
    const returned = src.slice(src.indexOf("return {\n      ok: true"));
    expect(returned).not.toMatch(/image|base64/);
    expect(code("components/recipe-scan.tsx")).not.toMatch(/localStorage|add_progress_photo/);
  });

  it("carries a range and its assumptions, not a single confident number", () => {
    const shape = recipePhotoDraft.shape;
    for (const field of ["caloriesLow", "caloriesHigh", "assumptions", "readable", "servings"]) {
      expect(Object.keys(shape)).toContain(field);
    }
    // The UI logs the bounds, so log_meal's existing honesty applies — the
    // midpoint is stored and nothing downstream calls it precise.
    const ui = code("components/recipe-scan.tsx");
    expect(ui).toMatch(/caloriesLow: estimate\.perServing\.caloriesLow/);
    expect(ui).toMatch(/caloriesHigh: estimate\.perServing\.caloriesHigh/);
    expect(ui).not.toMatch(/calories: estimate\.perServing\.calories\b/);
  });

  it("logs only when she says so", () => {
    const ui = code("components/recipe-scan.tsx");
    // The estimate arrives, and log_meal is behind its own button.
    expect(ui.indexOf("estimate_recipe_from_photo")).toBeLessThan(ui.indexOf('"log_meal"'));
    expect(ui).toMatch(/onClick=\{log\}/);
  });

  it("shrinks through the one shared shrinker, so EXIF cannot come back", () => {
    // Two copies would drift on the detail that matters: a phone attaches the
    // GPS coordinates of her kitchen, and the canvas re-encode is what drops
    // them.
    expect(code("components/recipe-scan.tsx")).toMatch(/from "@\/lib\/shrink"/);
    expect(code("components/photos.tsx")).toMatch(/from "@\/lib\/shrink"/);
    expect(code("components/photos.tsx")).not.toMatch(/toDataURL/);
    expect(read("lib/shrink.ts")).toMatch(/canvas\.toDataURL\("image\/jpeg"/);
  });
});

suite("which meal she is probably logging", () => {
  it("follows the clock, and falls back to a snack", () => {
    expect(slotForHour(8)).toBe("breakfast");
    expect(slotForHour(12)).toBe("lunch");
    expect(slotForHour(18)).toBe("dinner");
    expect(slotForHour(21)).toBe("dinner");
    expect(slotForHour(16)).toBe("snack");
    expect(slotForHour(23)).toBe("snack");
    expect(slotForHour(2)).toBe("snack");
  });

  it("is judged in her timezone", () => {
    expect(read("app/eat/page.tsx")).toMatch(/slotForHour\(hourIn\(profile\.timezone \?\? APP_TIMEZONE\)\)/);
  });
});

suite("the assumptions survive however the model sends them", () => {
  it("takes a plain list", () => {
    expect(tidyAssumptions(["Skinless thighs", "3 tbsp oil across 4"])).toEqual(["Skinless thighs", "3 tbsp oil across 4"]);
  });

  it("takes a one-element array holding a JSON list — what the first real photo returned", () => {
    const asSent = ["[\"Chicken thighs assumed boneless, skinless\", \"3 tbsp olive oil split across 4 servings\", \"Chickpeas drained, ~240g per tin\"]"];
    expect(tidyAssumptions(asSent)).toEqual([
      "Chicken thighs assumed boneless, skinless",
      "3 tbsp olive oil split across 4 servings",
      "Chickpeas drained, ~240g per tin",
    ]);
  });

  it("takes one string of lines, bulleted or not", () => {
    expect(tidyAssumptions("- Skin on\n- 2 tbsp oil\n")).toEqual(["Skin on", "2 tbsp oil"]);
    expect(tidyAssumptions("Portion guessed; oil included")).toEqual(["Portion guessed", "oil included"]);
  });

  it("keeps it to four, and copes with nothing at all", () => {
    expect(tidyAssumptions(["a", "b", "c", "d", "e"])).toHaveLength(4);
    expect(tidyAssumptions(undefined)).toEqual([]);
    expect(tidyAssumptions([])).toEqual([]);
    expect(tidyAssumptions("   ")).toEqual([]);
    expect(tidyAssumptions("[not json after all")).toEqual(["[not json after all"]);
  });
});
