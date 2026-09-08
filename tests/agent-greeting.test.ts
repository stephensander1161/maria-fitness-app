import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("a fresh conversation with someone already set up", () => {
  const route = () => read("app/api/chat/route.ts");

  it("branches on whether the account is onboarded, not on an empty transcript", () => {
    // Clearing the conversation empties the transcript, and that was read as
    // "the app has just been opened for the very first time" — so the coach
    // was told to onboard someone with months of training and a week already
    // built, saw the state block contradict it, and stopped to ask the user
    // which was true.
    expect(route()).toMatch(/text = profile\.onboardedAt \? RETURNING_PROMPT : FIRST_RUN_PROMPT/);
    expect(route()).toMatch(/const RETURNING_PROMPT =/);
    expect(route()).toMatch(/const FIRST_RUN_PROMPT =/);
  });

  it("tells it plainly not to onboard someone who already is", () => {
    const returning = route().slice(route().indexOf("const RETURNING_PROMPT ="));
    expect(returning.slice(0, 500)).toMatch(/Do NOT onboard them/);
  });

  it("names nobody's gender, because these two lines go to every account", () => {
    // The app is written "she" throughout, for the one person it began as.
    // These are sent to everyone, and the first thing the coach did with a
    // male user was point that out.
    const both = route().slice(route().indexOf("const FIRST_RUN_PROMPT ="), route().indexOf("export const runtime"));
    expect(both).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
  });
});

suite("the coach never hands a contradiction back", () => {
  it("is told the state block wins, and to say nothing about it", () => {
    const persona = read("lib/agent/system.ts");
    expect(persona).toMatch(/\*\*The state block wins, and she never hears about it\.\*\*/);
    expect(persona).toMatch(/Never stop to ask her which is true/);
    expect(persona).toMatch(/never narrate your own reasoning about what you were told/);
  });
});
