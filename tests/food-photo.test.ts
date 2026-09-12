import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { recipePhotoDraft } from "@/lib/agent/planner";

const scan = fs.readFileSync("components/recipe-scan.tsx", "utf8");

suite("photographing a plate", () => {
  it("is called what it does", () => {
    // It has always read a plate or a packet as happily as a recipe page —
    // the model is told all three — but it was called "Scan a recipe", so the
    // person who wanted to photograph his dinner had no way to know.
    expect(scan).toMatch(/Photograph your food/);
    expect(scan).not.toMatch(/>Scan a recipe</);
    // And the tool still offers all three to the coach.
    expect(fs.readFileSync("lib/tools/recipe-photo.ts", "utf8"))
      .toMatch(/a recipe page, a food label, or a plate of food/);
  });

  it("is a camera in the add-food row, not a card of its own", () => {
    // It was a heading and a paragraph in a card between the day's food and
    // the calculator. It is a third way to add food; it belongs with the two.
    expect(scan).not.toMatch(/<section className="card/);
    expect(scan).toMatch(/aria-label="Photograph your food"/);
    const food = fs.readFileSync("components/today-food.tsx", "utf8");
    expect(food).toMatch(/<RecipeScan defaultSlot=\{defaultSlot\} \/>/);
    // The panel drops to its own line — `basis-full` inside a wrapping row.
    expect(food).toMatch(/mt-4 flex flex-wrap gap-2/);
    expect(scan).toMatch(/basis-full/);
    expect(fs.readFileSync("components/eat-client.tsx", "utf8")).not.toMatch(/RecipeScan/);
  });

  it("reads a plate as one plate, not a recipe that makes one serving", () => {
    expect(scan).toMatch(/estimate\.servings > 1 \? "Per serving" : "This plate"/);
    expect(scan).toMatch(/\{estimate\.servings > 1 && \(/);
    // …and the entry it writes does not say "1 of 1".
    expect(scan).toMatch(/`\$\{estimate\.title\} \(from a photo\)`/);
  });

  it("estimates fibre like the other macros", () => {
    // It was the only one left out, so a meal logged from a photo made the day
    // a fibre floor however good the photo was.
    expect(recipePhotoDraft.shape).toHaveProperty("fibreG");
    expect(scan).toMatch(/fibreG: estimate\.perServing\.fibreG/);
  });

  it("still logs nothing it did not read", () => {
    // Unknown is not zero, here as everywhere else.
    expect(scan).toMatch(/estimate\.perServing\.fibreG === null \? \{\} :/);
  });

  it("keeps the range rather than a false single number", () => {
    expect(scan).toMatch(/caloriesLow: estimate\.perServing\.caloriesLow/);
    expect(scan).toMatch(/caloriesHigh: estimate\.perServing\.caloriesHigh/);
  });

  it("never logs by itself, and never keeps the photo", () => {
    // An app that quietly wrote a number it admits it is unsure of into her
    // day is one she stops trusting with the days it is sure about.
    expect(scan).toMatch(/The photo is not kept/);
    expect(scan).toMatch(/onClick=\{log\}/);
  });
});
