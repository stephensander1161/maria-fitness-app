import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { CARDS, cardOpen, isCardId, withCard } from "@/lib/cards";

const read = (p: string) => fs.readFileSync(p, "utf8");

/*
  "add a settings user preference to hide the warmup/cooldown cards" — and,
  a minute later, "add hide icon to the cards so user knows they can be
  hidden".

  The second half is the one that makes the first real. Both blocks already
  open closed at one line each, which is exactly why they had no way out:
  nothing that cheap looks worth a setting until you are the person scrolling
  past both of them four times a week, and a preference you cannot reach from
  the thing it is about is a preference nobody has.
*/
suite("the warm-up and the cool-down can be put away", () => {
  it("is the mechanism the app already had, not a new column", () => {
    // `collapsed_cards` is a list of ids on the profile, so a card that wants
    // this needs no migration — and it is on the account rather than in the
    // browser, so the choice follows her to a laptop.
    expect(isCardId("warmUp")).toBe(true);
    expect(isCardId("coolDown")).toBe(true);
    expect(Object.keys(CARDS)).toContain("warmUp");
    expect(Object.keys(CARDS)).toContain("coolDown");
    // Shown unless she has said otherwise. A card that starts hidden is a
    // feature she never learns exists.
    expect(cardOpen([], "warmUp")).toBe(true);
    expect(cardOpen(withCard([], "warmUp", false), "warmUp")).toBe(false);
    // And the other one is untouched by it.
    expect(cardOpen(withCard([], "warmUp", false), "coolDown")).toBe(true);
  });

  it("means the coach can do it by asking, with no new tool", () => {
    /*
      `set_card_collapsed` takes any card id and lists them in its own
      description, so "hide the warm-up" works the moment the id exists. That
      is the premise of the app — anything she can tap she can also ask for —
      and it costs nothing here.
    */
    const tool = read("lib/tools/appearance.ts");
    expect(tool).toMatch(/Object\.entries\(CARDS\)/);
    expect(tool).toMatch(/name: "set_card_collapsed"/);
  });

  it("draws the way out on the card itself", () => {
    const block = read("components/stretch-block.tsx");
    // A row of two controls: a button inside a button is not something a
    // browser will render.
    expect(block).toMatch(/aria-expanded=\{open\}/);
    expect(block).toMatch(/onHide && \(/);
    // The label says where it goes, because a control that removes something
    // has to say how to get it back.
    expect(block).toMatch(/you can bring it back in Settings/);
  });

  it("hides on the tap and saves behind it", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/setFolded\(\(f\) => withCard\(f, card, false\)\)/);
    expect(card).toMatch(/\{showing\("warmUp"\) && \(/);
    expect(card).toMatch(/\{showing\("coolDown"\) && \(/);
    expect(card).toMatch(/onHide=\{\(\) => hideCard\("warmUp"\)\}/);
    expect(card).toMatch(/onHide=\{\(\) => hideCard\("coolDown"\)\}/);
  });

  it("leaves the rest-day block alone, because it is the whole screen", () => {
    // Hiding it would leave a rest day showing nothing at all — and the card
    // above it says "a walk or some mobility work is plenty", which is the app
    // naming a thing it then does not do.
    const card = read("components/train-client.tsx");
    const rest = card.slice(card.indexOf('tone="rest"') - 200, card.indexOf('tone="rest"') + 300);
    expect(rest).not.toMatch(/onHide/);
  });

  it("and Settings is the way back", () => {
    const page = read("app/settings/page.tsx");
    expect(page).toMatch(/<StretchVisibility collapsedCards=\{profile\.collapsedCards\} \/>/);
    const panel = read("components/stretch-visibility.tsx");
    // A real switch, announced as one.
    expect(panel).toMatch(/role="switch"/);
    expect(panel).toMatch(/aria-checked=\{shown\}/);
    // `edge`, not `line`: it is a control's outline and has to clear 3:1.
    expect(panel).toMatch(/border-edge/);
    expect(panel).toMatch(/role="alert"/);
  });
});
