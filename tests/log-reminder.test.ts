import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const provider = fs.readFileSync("components/rest-provider.tsx", "utf8");
const card = fs.readFileSync("components/train-client.tsx", "utf8");
const field = fs.readFileSync("components/number-field.tsx", "utf8");
const page = fs.readFileSync("app/train/[slug]/page.tsx", "utf8");

suite('"Log your bench set" actually logs it', () => {
  it("goes to the movement, not to the screen she is already on", () => {
    // It pointed at /train. On the Train screen that is where she already is,
    // so the button did nothing and read as a second ✕.
    const reminder = provider.slice(provider.indexOf("function LogReminder"));
    expect(reminder).toMatch(/href=\{`\/train\/\$\{rest\.slug\}\?log=1/);
    expect(reminder).not.toMatch(/href="\/train"/);
  });

  it("keeps the day the set belongs to", () => {
    // A reminder raised on Wednesday's session must not open Thursday's card.
    const reminder = provider.slice(provider.indexOf("function LogReminder"));
    expect(reminder).toMatch(/rest\.date \? `&d=\$\{rest\.date\}` : ""/);
  });

  it("puts the caret in the weight, ready to type", () => {
    expect(page).toMatch(/focusEntry=\{log === "1"\}/);
    expect(card).toMatch(/focusOnMount=\{focusEntry\}/);
    // A press-up has no weight field, so the count takes it instead.
    expect(card).toMatch(/focusOnMount=\{focusEntry && !loaded\}/);
  });

  it("selects what is there rather than appending to it", () => {
    // She is replacing last set's weight. A caret after "95" means typing 100
    // gives 95100.
    expect(field).toMatch(/el\.select\(\)/);
  });

  it("never grabs focus on its own", () => {
    // Focusing an input the moment a card opens is a keyboard over the thing
    // she came to read — that was a real bug, on the target inputs.
    expect(field).toMatch(/focusOnMount = false/);
    const targets = card.slice(card.indexOf('field("r"') - 600, card.indexOf('field("r"') + 400);
    expect(targets).not.toMatch(/focusOnMount/);
  });
});
