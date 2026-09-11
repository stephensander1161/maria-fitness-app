import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CARDS, cardOpen, isCardId, movementCard, withCard, type CardId } from "@/lib/cards";

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

suite("a card there can be any number of", () => {
  it("addresses a movement card by its slug", () => {
    // 188 movements and growing: they cannot each be an entry in a list of
    // the app's own furniture.
    expect(movementCard("barbell-bench-press")).toBe("movement:barbell-bench-press");
    expect(isCardId("movement:barbell-bench-press")).toBe(true);
    expect(cardOpen(["movement:plank"], "movement:plank" as CardId)).toBe(false);
    expect(cardOpen(["movement:plank"], "movement:squat" as CardId)).toBe(true);
  });

  it("takes only the shape it expects", () => {
    // Narrow on purpose: a stale client or a typo must not be able to write
    // preferences nothing will ever read back, one row at a time.
    for (const junk of [
      "movement:", "movement:With Caps", "movement:a b", "movement:../etc",
      "movement:" + "x".repeat(81), "workout:plank", "movement", ":plank",
    ]) {
      expect(isCardId(junk), junk).toBe(false);
    }
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

suite("a folded movement card is its name and its target", () => {
  const card = fs.readFileSync("components/train-client.tsx", "utf8");

  it("shows nothing else", () => {
    // A day is four to six of these and the ones she has finished take the
    // most room. Measured on an iPhone 14 Pro: 213px to 73px.
    expect(card).toMatch(/const shut = folded && !open;/);
    expect(card).toMatch(/\{!shut && <>/);
    // The figure and the row of controls go with the rest of it.
    expect(card).toMatch(/\{!shut && \(\s*<ExerciseFigure/);
    expect(card).toMatch(/\$\{shut \? "hidden" : ""\}/);
  });

  it("keeps the one control that can undo it", () => {
    // Without it a folded card is a card she cannot get back.
    expect(card).toMatch(/aria-label=\{shut \? `Show \$\{exercise\.name\}`/);
    expect(card).toMatch(/aria-expanded=\{!shut\}/);
  });

  it("loses to opening the card for a set", () => {
    // She has asked for the thing the fold was hiding.
    expect(card).toMatch(/folded && !open/);
  });

  it("folds on the tap and saves behind it", () => {
    expect(card).toMatch(/setFolded\(\(f\) =>/);
    expect(card).toMatch(/action\("set_card_collapsed", \{ card: id, collapsed: shut \}\)/);
  });
});
