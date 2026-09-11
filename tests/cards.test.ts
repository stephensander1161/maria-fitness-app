import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CARDS, cardOpen, isCardId, withCard } from "@/lib/cards";

suite("cards she can fold away", () => {
  it("starts open, always", () => {
    // A card that arrives closed is one she has to discover, and what it holds
    // is what teaches her it is worth having. Only a deliberate tap folds it.
    expect(cardOpen([], "plannedFood")).toBe(true);
    expect(cardOpen(null, "plannedFood")).toBe(true);
    expect(cardOpen(undefined, "plannedFood")).toBe(true);
  });

  it("stays folded once she says so", () => {
    expect(cardOpen(["plannedFood"], "plannedFood")).toBe(false);
    // And one card folded does not fold another.
    expect(cardOpen(["somethingElse"], "plannedFood")).toBe(true);
  });

  it("never grows duplicates, however often it is toggled", () => {
    let list = withCard([], "plannedFood", false);
    list = withCard(list, "plannedFood", false);
    expect(list).toEqual(["plannedFood"]);
    expect(withCard(list, "plannedFood", true)).toEqual([]);
  });

  it("leaves other cards alone when one changes", () => {
    expect(withCard(["other"], "plannedFood", false).sort()).toEqual(["other", "plannedFood"]);
    expect(withCard(["other", "plannedFood"], "plannedFood", true)).toEqual(["other"]);
  });

  it("refuses an id it does not know", () => {
    // The list is in code, so a stale id from an old client cannot write a
    // preference nothing will ever read back.
    expect(isCardId("plannedFood")).toBe(true);
    expect(isCardId("nonsense")).toBe(false);
    const tool = fs.readFileSync("lib/tools/appearance.ts", "utf8");
    expect(tool).toMatch(/if \(!isCardId\(input\.card\)\)/);
  });
});

suite("the choice follows her, not the browser", () => {
  it("lives on the account", () => {
    // Same reason the theme does: she chooses on her phone and the laptop
    // agrees. localStorage would have been one browser's opinion.
    expect(fs.readFileSync("lib/db/schema.ts", "utf8")).toMatch(/collapsedCards: jsonb\("collapsed_cards"\)/);
    expect(fs.readFileSync("app/eat/page.tsx", "utf8"))
      .toMatch(/cardOpen\(profile\.collapsedCards, "plannedFood"\)/);
  });

  it("is a list, so the next card needs no migration", () => {
    expect(Object.keys(CARDS).length).toBeGreaterThan(0);
    expect(fs.readFileSync("lib/db/schema.ts", "utf8")).toMatch(/\$type<string\[\]>\(\)/);
  });

  it("is askable too", () => {
    expect(fs.readFileSync("lib/tools/index.ts", "utf8")).toMatch(/appearance\.setCardCollapsed/);
  });
});
