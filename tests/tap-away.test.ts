import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { tapDismisses, TAP_AWAY_ARM_MS } from "@/lib/use-tap-away";

suite("putting a note away by tapping elsewhere", () => {
  it("dismisses a tap outside it", () => {
    // "Got it" being the only way out makes a notification something she has
    // to deal with, and on a phone that button sits low over the page she is
    // trying to read.
    expect(tapDismisses({ armed: true, inside: false })).toBe(true);
  });

  it("never on a tap that landed on the note", () => {
    // Tapping a link inside it would otherwise dismiss and navigate at once.
    expect(tapDismisses({ armed: true, inside: true })).toBe(false);
  });

  it("never before she has had a chance to read it", () => {
    // The note is marked read on the account and does not come back, so a
    // stray tap during the rise animation costs her the whole message. This
    // is the one failure that would make the feature pointless.
    expect(tapDismisses({ armed: false, inside: false })).toBe(false);
    expect(TAP_AWAY_ARM_MS).toBeGreaterThan(320);
  });

  it("does not swallow the tap it acts on", () => {
    // No backdrop and no preventDefault: the tap that dismisses also presses
    // whatever was under her thumb. A transparent backdrop would make the
    // first tap on the page do nothing, which is a worse trade than a button.
    // Comments stripped: the prose above the hook explains why it does not
    // call preventDefault, and matching that would pass with the code doing it.
    const src = fs.readFileSync("lib/use-tap-away.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/preventDefault|stopPropagation/);
    expect(src).toMatch(/addEventListener\("pointerdown", onDown, true\)/);
  });
});

suite("which notes may be dismissed this way", () => {
  it("the one that tells her something", () => {
    expect(fs.readFileSync("components/whats-new-note.tsx", "utf8")).toMatch(/useTapAway/);
  });

  it("never the one that asks her something", () => {
    // "Did that fix it?" dismissed by brushing the screen throws away the
    // answer, which is the entire reason for asking — and reopening the
    // request is how somebody avoids writing their report out twice.
    const shipped = fs.readFileSync("components/shipped-note.tsx", "utf8");
    expect(shipped).not.toMatch(/useTapAway/);
    expect(shipped).toMatch(/Not quite/);
  });
});

suite("it goes away on the tap, not on the round trip", () => {
  it("hides first and saves behind it", () => {
    // It used to wait: she pressed "Got it", the button became an ellipsis,
    // and the note sat there for as long as the request took. On a slow
    // connection that reads as a button that did not work, and the second
    // press has nothing left to do.
    const note = fs.readFileSync("components/whats-new-note.tsx", "utf8");
    const fn = note.slice(note.indexOf("function dismiss()"));
    expect(fn.indexOf("setGone(true)")).toBeLessThan(fn.indexOf("action("));
    // And nothing awaits the write.
    expect(fn.slice(0, 400)).not.toMatch(/await action/);
    expect(fn.slice(0, 400)).toMatch(/void action\("dismiss_whats_new"\)/);
  });

  it("does not ask the server to re-render before the write lands", () => {
    // The note removes itself locally; a refresh in the same breath is how it
    // would come straight back.
    const note = fs.readFileSync("components/whats-new-note.tsx", "utf8");
    expect(note).not.toMatch(/router\.refresh\(\)/);
  });
});
