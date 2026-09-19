import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { inOrder } from "@/components/train-client";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("one list decides which movement is first — 2026-09-18", () => {
  /*
    "After changing order, first place is not updated everywhere." The cards
    were drawn in the order she dragged and the green marker was read from
    the order the server still held, so the ring stayed on whatever used to
    be next — with two undone movements above it.
  */
  const ex = (slug: string) => ({ slug });

  it("is her order when she has dragged, and the server's when she has not", () => {
    const list = [ex("a"), ex("b"), ex("c")];
    expect(inOrder(list, null)).toBe(list);
    expect(inOrder(list, ["c", "a", "b"]).map((e) => e.slug)).toEqual(["c", "a", "b"]);
  });

  it("keeps a movement the drag never saw, on the end", () => {
    // Added by the coach while the write was in flight: it must not vanish
    // because it is missing from the list she dropped.
    expect(inOrder([ex("a"), ex("b"), ex("new")], ["b", "a"]).map((e) => e.slug)).toEqual(["b", "a", "new"]);
    // And a slug that is no longer there is simply not drawn.
    expect(inOrder([ex("a")], ["gone", "a"]).map((e) => e.slug)).toEqual(["a"]);
  });

  it("the cards, the marker, the rest provider and what follows a set all read it", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/const shown = inOrder\(view\.exercises, dragOrder\);/);
    expect(card).toMatch(/\?\? shown\.find\(\(e\) => e\.targetSets > 0 && e\.loggedToday\.length < e\.targetSets\)\?\.slug/);
    expect(card).toMatch(/setSession\(inOrder\(view\.exercises, dragOrder\)\.map/);
    expect(card).toMatch(/afterSet\(inOrder\(view\.exercises, dragOrder\), ex\.slug, alreadyDone\)/);
    expect(card).toMatch(/const outstanding = shown/);
    // Nothing reads the server's order for position any more.
    expect(card).not.toMatch(/view\.exercises\.find\(\(e\) => e\.targetSets > 0/);
  });

  it("holds her order until the server sends it back, not for a guessed moment", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/view\.exercises\.every\(\(e, i\) => e\.slug === dragOrder\[i\]\)/);
    expect(card).not.toMatch(/setTimeout\(\(\) => setDragOrder\(null\), 600\)/);
    // A write that failed snaps back rather than showing an order nobody has.
    expect(card).toMatch(/setError\("Couldn't save the new order\."\);\s*\n\s*\/\/[\s\S]{0,140}setDragOrder\(null\);/);
  });

  it("drops a rest that was pointing at the old next movement", () => {
    const card = read("components/train-client.tsx");
    expect(card).toMatch(/const restingOn = view\.exercises\.find\(\(e\) => e\.slug === runningRest\?\.slug\);/);
    expect(card).toMatch(/if \(restingOn && restingOn\.loggedToday\.length === 0\) dismissRest\(\);/);
  });
});
