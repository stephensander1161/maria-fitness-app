import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  CARDS, cardOpen, isCardId, movementCard, movementFolded, withCard, withMovementFold, type CardId,
} from "@/lib/cards";

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

suite("a folded movement card is its name and what she did", () => {
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
    expect(card).toMatch(/aria-label=\{shut \? `Show \$\{name\}`/);
    expect(card).toMatch(/aria-expanded=\{!shut\}/);
    // Folded there is no controls row for it to sit in, so it goes on the
    // name's line; open it goes at the end of the controls row instead.
    expect(card).toMatch(/onFold && shut && <FoldToggle/);
    expect(card).toMatch(/className="ml-auto md:ml-0"/);
  });

  it("says what she did, not what she was aiming for", () => {
    // The target is the one number on a finished movement she no longer
    // needs, and showing it on a folded card read as though nothing had been
    // logged at all.
    expect(card).toMatch(/shut && logged !== null/);
    expect(card).toMatch(/loggedSummary\(exercise\.loggedToday, unit, exercise\.isHold\)/);
  });

  it("loses to opening the card for a set", () => {
    // She has asked for the thing the fold was hiding.
    expect(card).toMatch(/folded && !open/);
  });

  it("folds on the tap and saves behind it", () => {
    expect(card).toMatch(/setFolded\(\(f\) => withMovementFold\(f, slug, shut\)\)/);
    expect(card).toMatch(/action\("set_card_collapsed", \{ card: movementCard\(slug\), collapsed: shut \}\)/);
  });
});

suite("a finished movement folds itself", () => {
  it("folds once its sets are done", () => {
    // From the moment it is finished, the sets she logged are the least
    // useful thing on the screen.
    expect(movementFolded([], "plank", true)).toBe(true);
    expect(movementFolded([], "plank", false)).toBe(false);
  });

  it("but a decision she made outranks it, both ways", () => {
    // Folded half-done stays folded; opened-when-finished stays open. Without
    // the second marker the card she deliberately opened folds itself again
    // the moment the page reloads, which reads as the app arguing with her.
    expect(movementFolded(["movement:plank"], "plank", false)).toBe(true);
    expect(movementFolded(["open:movement:plank"], "plank", true)).toBe(false);
  });

  it("writes the two markers as a pair", () => {
    // A list holding both is a state no reader can resolve.
    const shut = withMovementFold([], "plank", true);
    expect(shut).toEqual(["movement:plank"]);
    const open = withMovementFold(shut, "plank", false);
    expect(open).toEqual(["open:movement:plank"]);
    expect(withMovementFold(open, "plank", true)).toEqual(["movement:plank"]);
  });

  it("leaves other movements alone", () => {
    expect(withMovementFold(["movement:squat"], "plank", true).sort())
      .toEqual(["movement:plank", "movement:squat"]);
  });

  it("takes only the shape it expects, for the open marker too", () => {
    expect(isCardId("open:movement:plank")).toBe(true);
    for (const junk of ["open:plank", "open:movement:", "open:movement:With Caps", "open:"]) {
      expect(isCardId(junk), junk).toBe(false);
    }
  });

  it("is what the screen and the tool both use", () => {
    const card = fs.readFileSync("components/train-client.tsx", "utf8");
    expect(card).toMatch(/movementFolded\(folded, ex\.slug, ex\.targetSets > 0 && ex\.loggedToday\.length >= ex\.targetSets\)/);
    // And the pair is written server-side too, or a reload would disagree
    // with what she just tapped.
    expect(fs.readFileSync("lib/tools/appearance.ts", "utf8"))
      .toMatch(/withMovementFold\(p\?\.collapsed, movement, input\.collapsed\)/);
  });
});
