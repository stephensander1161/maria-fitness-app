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
