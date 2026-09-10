import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * The one block the model believes completely, and the two ways it has now
 * been wrong in production.
 *
 * Both were reproduced against a real session before the wording changed, and
 * both are about the block being *right* while the answer was wrong — so what
 * is checked here is the sentence that makes the model prefer it.
 */
suite("today's session, as the coach is told it", () => {
  const src = read("lib/progress.ts");
  const snapshot = src.slice(src.indexOf("export async function todaySnapshot"));

  it("says the count is current, and beats anything said earlier in the thread", () => {
    // She logs sets between messages. Three turns ago the coach answered "1
    // set" and that sentence is still in the transcript, so it kept repeating
    // it: its own prose reads as more recent than a block it has now seen five
    // times. Asked "where am I at?" after six sets it said "three sets in".
    expect(snapshot).toMatch(/AS OF THIS MESSAGE/);
    expect(snapshot).toMatch(/rather than any number said earlier in this conversation/);
  });

  it("refuses the shorthand that once hid a personal best", () => {
    // "6×8 @ 60lb" for a session that finished at 95. Every set is rendered,
    // and the block says not to fold ones that differ back together.
    expect(snapshot).toMatch(/do not collapse ones that differ/);
    expect(snapshot).not.toMatch(/sets\[0\]/);
  });

  it("states the total rather than leaving it to be counted", () => {
    // Four sets were listed correctly and the coach said "three".
    expect(snapshot).toMatch(/ALREADY LOGGED \$\{total\}/);
    expect(snapshot).toMatch(/Those counts are exact/);
  });

  it("and the persona carries the same rule about the thread", () => {
    const persona = read("lib/agent/system.ts");
    expect(persona).toMatch(/The state block is \*now\*/);
    expect(persona).toMatch(/never from what you or she said earlier in the thread/);
  });
});
