import { describe as suite, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { __test } from "@/lib/agent/history";

/**
 * The replay window has to be valid Anthropic input at both ends. A broken
 * start drops a tool_result with no tool_use above it; a broken end leaves a
 * tool_use nobody answered — and that one is unrecoverable from inside the
 * app, because every subsequent turn is rejected before it reaches the model.
 */
const user = (text: string): Anthropic.MessageParam => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string): Anthropic.MessageParam =>
  ({ role: "assistant", content: [{ type: "text", text }] });
const calling = (id: string): Anthropic.MessageParam => ({
  role: "assistant",
  content: [{ type: "text", text: "let me check" }, { type: "tool_use", id, name: "get_plan", input: {} }],
});
const answered = (id: string): Anthropic.MessageParam => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: "{}" }],
});

suite("the replayed window is always valid at both ends", () => {
  it("drops an unanswered tool call left by a killed function", () => {
    // 45s planner call inside a 60s function: the assistant turn was saved,
    // the results never were. Without this the coach 400s on every turn from
    // then on, forever, with no way to clear it from the app.
    const out = __test.trimToValidEnd([user("hi"), assistant("hello"), calling("t1")]);
    expect(out).toHaveLength(2);
  });

  it("keeps a tool call that was answered", () => {
    const out = __test.trimToValidEnd([user("hi"), calling("t1"), answered("t1")]);
    expect(out).toHaveLength(3);
  });

  it("leaves an ordinary reply alone", () => {
    const out = __test.trimToValidEnd([user("hi"), assistant("hello")]);
    expect(out).toHaveLength(2);
  });

  it("starts at a real message, never at an orphaned tool result", () => {
    const out = __test.trimToValidStart([answered("t0"), user("hi"), assistant("hello")]);
    expect(out[0]).toEqual(user("hi"));
  });

  it("returns nothing rather than an invalid window", () => {
    expect(__test.trimToValidStart([answered("t0")])).toEqual([]);
  });
});
