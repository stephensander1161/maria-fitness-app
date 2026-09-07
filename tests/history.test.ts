import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
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

suite("an orphaned tool call anywhere in the window is answered", () => {
  const orphanResult = (id: string) => expect.objectContaining({ type: "tool_result", tool_use_id: id, is_error: true });

  it("inserts an error result after an assistant turn nobody answered", () => {
    // Her next message was saved before the history was loaded, so the
    // orphan is in the middle by the time anyone looks — trimToValidEnd
    // cannot see it, and every turn 400ed with "tool_use ids were found
    // without tool_result blocks", shown to her verbatim.
    const out = __test.answerOrphans([user("plan my meals"), calling("t1"), user("hello?")]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "user"]);
    expect(out[2].content).toEqual([orphanResult("t1")]);
    expect(out[3]).toEqual(user("hello?"));
  });

  it("completes a partial answer in place rather than splitting it", () => {
    const two: Anthropic.MessageParam = {
      role: "assistant",
      content: [
        { type: "tool_use", id: "a", name: "get_plan", input: {} },
        { type: "tool_use", id: "b", name: "get_meal_plan", input: {} },
      ],
    };
    const out = __test.answerOrphans([user("x"), two, answered("a"), assistant("done")]);
    expect(out).toHaveLength(4);
    const content = out[2].content as Anthropic.ContentBlockParam[];
    expect(content).toHaveLength(2);
    expect(content).toContainEqual(orphanResult("b"));
    expect(content).toContainEqual(expect.objectContaining({ type: "tool_result", tool_use_id: "a", content: "{}" }));
  });

  it("leaves a properly answered transcript exactly as it was", () => {
    const list = [user("x"), calling("t1"), answered("t1"), assistant("done"), user("more")];
    expect(__test.answerOrphans(list)).toEqual(list);
  });

  it("does not invent a result — it says the call was interrupted", () => {
    const [, , fix] = __test.answerOrphans([user("x"), calling("t1"), user("y")]);
    const block = (fix.content as Anthropic.ToolResultBlockParam[])[0];
    expect(block.content).toMatch(/interrupted/);
    expect(block.is_error).toBe(true);
  });
});

suite("what she is told when the coach fails", () => {
  it("is a sentence, never the API's own message", () => {
    const src = fs.readFileSync("lib/agent/loop.ts", "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/Coach unavailable \(\$\{err\.status\}\)/);
    // In the catch block, what is yielded to her is chosen without reading
    // the error's text. (A tool's own error still goes to the model as a
    // tool_result — that is a different audience.)
    const tail = code.slice(code.lastIndexOf("catch (err)"));
    const chosen = tail.slice(tail.indexOf("const message ="), tail.indexOf("yield"));
    expect(chosen).not.toMatch(/err\.message|detail|String\(err\)/);
    // …and the specifics go where the admin console reads them.
    expect(code).toMatch(/recordError\(\{/);
    expect(code).toMatch(/route: "\/api\/chat"/);
  });
});
