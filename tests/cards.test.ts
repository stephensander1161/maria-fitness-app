import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  CARDS, cardOpen, cardShown, isCardId, movementCard, movementFolded, orderFor, PAGE_CARDS,
  withCard, withHidden, withMoved, withMovementFold, type CardId,
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
    /*
      And that line is every set, set by set. It was `loggedSummary`, which
      compresses four identical sets to "4×12 @ 60lb" — true, and not what a
      folded card is for: "Collapsed movement cards don't show all my sets
      anymore?" The sets are the one thing on a finished card she still wants
      to see, and four squares' worth of numbers fit one line.
    */
    expect(card).toMatch(/exercise\.loggedToday\.map\(\(s\) => describeSet\(s, exercise\.isHold\)\)\.join\(" \\u00b7 "\)/);
    expect(card).not.toMatch(/const logged = loggedSummary\(/);
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

suite("the cards on a screen, in her order — 2026-09-18", () => {
  /*
    "Should we make all cards on all pages reorganisable?" — "just do it now."
    Train and Eat, the screens she lives in: walk a card up or down, or hide
    it, from the panel at the foot of the screen or by asking the coach.
  */
  it("starts in the default order, and anything she never mentioned follows in it", () => {
    expect(orderFor("train", null)).toEqual(["warmUp", "movements", "coolDown", "addExercise", "summary", "fact", "companion"]);
    expect(orderFor("eat", {})).toEqual(["todayFood", "plannedFood", "calculator", "burn", "fact", "companion"]);
    // A partial order she saved before a card existed: hers first, then the rest.
    expect(orderFor("eat", { eat: { order: ["calculator", "todayFood"] } })).toEqual(["calculator", "todayFood", "plannedFood", "burn", "fact", "companion"]);
    // Nothing unknown survives — a card renamed or removed does not haunt the list.
    expect(orderFor("train", { train: { order: ["ghost", "summary"] } })).toEqual(["summary", "warmUp", "movements", "coolDown", "addExercise", "fact", "companion"]);
  });

  it("moves one card up, down, to the top or the bottom, and never off the end", () => {
    let l = withMoved("eat", null, "calculator", "up");
    expect(orderFor("eat", l)).toEqual(["todayFood", "calculator", "plannedFood", "burn", "fact", "companion"]);
    l = withMoved("eat", l, "calculator", "top");
    expect(orderFor("eat", l)).toEqual(["calculator", "todayFood", "plannedFood", "burn", "fact", "companion"]);
    expect(orderFor("eat", withMoved("eat", l, "calculator", "up"))).toEqual(orderFor("eat", l));
    l = withMoved("eat", l, "calculator", "bottom");
    expect(orderFor("eat", l)).toEqual(["todayFood", "plannedFood", "burn", "fact", "companion", "calculator"]);
    expect(orderFor("eat", withMoved("eat", l, "calculator", "down"))).toEqual(orderFor("eat", l));
    // Another screen's order is untouched.
    expect(withMoved("eat", { train: { order: ["summary"] } }, "burn", "top").train).toEqual({ order: ["summary"] });
  });

  it("hides a card, shows it again, and refuses to hide the point of the screen", () => {
    const { layout } = withHidden("eat", null, [], "calculator", true);
    expect(cardShown("eat", layout, [], "calculator")).toBe(false);
    expect(cardShown("eat", withHidden("eat", layout, [], "calculator", false).layout, [], "calculator")).toBe(true);
    for (const [page, id] of [["eat", "todayFood"], ["train", "movements"], ["eat", "companion"], ["train", "companion"]] as const) {
      expect(PAGE_CARDS[page].find((c) => c.id === id)!.hideable).toBe(false);
      expect(cardShown(page, withHidden(page, null, [], id, true).layout, [], id)).toBe(true);
    }
  });

  it("keeps the warm-up and cool-down's hide where it always was, so Settings and the icon still work", () => {
    const { layout, collapsed } = withHidden("train", null, [], "warmUp", true);
    expect(collapsed).toEqual(["warmUp"]);
    expect(layout.train?.hidden ?? []).toEqual([]);
    expect(cardShown("train", null, ["coolDown"], "coolDown")).toBe(false);
    expect(withHidden("train", null, ["warmUp"], "warmUp", false).collapsed).toEqual([]);
  });

  it("is what both screens draw from, each card carrying its own grip, and what the coach can change", () => {
    // "I don't like arrange this screen being its own card; it should live
    // in each of the cards, like the movement cards." (2026-09-18)
    const train = fs.readFileSync("components/train-client.tsx", "utf8");
    const eat = fs.readFileSync("components/eat-client.tsx", "utf8");
    expect(train).toMatch(/orderFor\("train", cardLayout\)/);
    expect(train).toMatch(/<ArrangeHandle page="train" id=\{id\} first=\{i === 0\} last=\{i === shown\.length - 1\} \/>/);
    expect(eat).toMatch(/orderFor\("eat", cardLayout\)/);
    expect(eat).toMatch(/<ArrangeHandle page="eat" id=\{id\}/);
    expect(fs.existsSync("components/arrange-cards.tsx")).toBe(false);
    expect(fs.readFileSync("lib/tools/index.ts", "utf8")).toMatch(/appearance\.arrangeCards/);
    // The grip walks, it does not drag.
    const handle = fs.readFileSync("components/arrange-handle.tsx", "utf8");
    expect(handle).not.toMatch(/onPointerMove|draggable/);
    expect(handle).toMatch(/action\("arrange_cards"/);
  });
});

suite("the fact and the coach are cards on the two screens that arrange — 2026-09-18", () => {
  // "The stick man container and did you know component both aren't
  // sortable like the others are." The layout draws them under every other
  // screen; Train and Eat draw them from their own list.
  it("the layout steps aside on Train and Eat, and the pages place them", () => {
    expect(fs.readFileSync("app/layout.tsx", "utf8")).toMatch(/<LayoutFurniture>\s*<DailyFact \/>\s*<CompanionGate \/>\s*<\/LayoutFurniture>/);
    expect(fs.readFileSync("components/layout-furniture.tsx", "utf8")).toMatch(/new Set\(\["\/train", "\/eat"\]\)/);
    for (const p of ["app/train/page.tsx", "app/eat/page.tsx"]) {
      expect(fs.readFileSync(p, "utf8"), p).toMatch(/furniture=\{\{ fact: <DailyFact \/>, companion: <CompanionGate \/> \}\}/);
    }
    expect(fs.readFileSync("components/train-client.tsx", "utf8")).toMatch(/blocks\.companion = furniture\?\.companion/);
    expect(fs.readFileSync("components/eat-client.tsx", "utf8")).toMatch(/blocks\.companion = /);
  });
});
