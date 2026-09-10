import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { answerAfter, relay, type Sink } from "@/lib/agent/relay";
import type { CoachEvent } from "@/lib/agent/loop";

/** A sink that goes deaf partway through, the way a cancelled stream does. */
function deafAfter(n: number) {
  const written: CoachEvent[] = [];
  let closed = false;
  const sink: Sink = {
    write(e) {
      if (written.length >= n) throw new TypeError("Invalid state: Controller is already closed");
      written.push(e);
    },
    close() {
      if (closed) throw new Error("already closed");
      closed = true;
    },
  };
  return { sink, written, isClosed: () => closed };
}

suite("a turn outlives the connection", () => {
  it("runs the whole loop after she backgrounds the app", async () => {
    // This is the bug. Events went straight to controller.enqueue; enqueueing
    // into a cancelled stream throws; that threw out of the `for await`, which
    // returns the generator and abandons the coach mid-tool-loop. The row was
    // written and the coach never got to say so.
    const ran: string[] = [];
    async function* turn(): AsyncGenerator<CoachEvent> {
      yield { type: "accepted" };
      ran.push("accepted");
      yield { type: "tool", name: "log_meal", status: "running" };
      ran.push("tool-ran");           // she switches apps about here
      yield { type: "text", text: "Logged the pulled pork." };
      ran.push("answer-saved");       // runCoach's saveMessage
      yield { type: "done" };
      ran.push("done");
    }

    const { sink, written, isClosed } = deafAfter(1);
    await relay(turn(), sink);

    expect(ran).toEqual(["accepted", "tool-ran", "answer-saved", "done"]);
    // It stopped talking to a closed socket rather than retrying into it.
    expect(written).toHaveLength(1);
    expect(isClosed()).toBe(true);
  });

  it("delivers everything when she is still there", async () => {
    async function* turn(): AsyncGenerator<CoachEvent> {
      yield { type: "accepted" };
      yield { type: "text", text: "hi" };
      yield { type: "done" };
    }
    const { sink, written } = deafAfter(99);
    await relay(turn(), sink);
    expect(written.map((e) => e.type)).toEqual(["accepted", "text", "done"]);
  });

  it("reports a failed turn, and never rejects", async () => {
    async function* turn(): AsyncGenerator<CoachEvent> {
      yield { type: "accepted" };
      throw new Error("Overloaded");
    }
    const { sink, written, isClosed } = deafAfter(99);
    await expect(relay(turn(), sink)).resolves.toBeUndefined();
    expect(written.at(-1)).toEqual({ type: "error", message: "Overloaded" });
    expect(isClosed()).toBe(true);
  });

  it("survives a sink that throws on close too", async () => {
    async function* turn(): AsyncGenerator<CoachEvent> { yield { type: "done" }; }
    const sink: Sink = {
      write() { throw new Error("gone"); },
      close() { throw new Error("gone"); },
    };
    await expect(relay(turn(), sink)).resolves.toBeUndefined();
  });

  it("is what the chat route actually uses, kept alive past the response", () => {
    // Draining after the response ends is only worth anything if the platform
    // is told not to freeze the function while it happens.
    const route = fs.readFileSync("app/api/chat/route.ts", "utf8");
    expect(route).toMatch(/relay\(runCoach\(/);
    expect(route).toMatch(/after\(turn\.catch\(/);
    expect(route).toMatch(/import \{ after \} from "next\/server"/);
    // No second, bypassing drain: one path, or the invariant above is a lie.
    expect(route).not.toMatch(/for await[\s\S]{0,60}runCoach/);
  });
});

suite("picking the answer back up", () => {
  const thread = [
    { id: "1", role: "user", text: "what should I eat" },
    { id: "2", role: "assistant", text: "Something with protein." },
    { id: "3", role: "user", text: "log the pulled pork" },
    { id: "4", role: "assistant", text: "Logged it — 480 kcal." },
  ];

  it("finds the answer written while the phone was locked", () => {
    expect(answerAfter(thread, "log the pulled pork").map((m) => m.id)).toEqual(["4"]);
  });

  it("takes the last time she said it, not the first", () => {
    // She asked twice because the first looked broken. It is the newest turn
    // that is missing its answer; matching the first would replay an old one.
    const twice = [
      ...thread,
      { id: "5", role: "user", text: "log the pulled pork" },
      { id: "6", role: "assistant", text: "Logged it again — 480 kcal." },
    ];
    expect(answerAfter(twice, "log the pulled pork").map((m) => m.id)).toEqual(["6"]);
  });

  it("says nothing when the turn has not finished yet", () => {
    // The socket can die long before the turn ends. Empty means keep waiting,
    // and the caller must not read it as "there was no answer".
    expect(answerAfter(thread.slice(0, 3), "log the pulled pork")).toEqual([]);
  });

  it("ignores whitespace, matches nothing on an empty ask", () => {
    expect(answerAfter(thread, "  log the pulled pork\n")).toHaveLength(1);
    // A kickoff turn is silent and not in the transcript at all.
    expect(answerAfter(thread, "   ")).toEqual([]);
  });

  it("never hands back her own words as an answer", () => {
    const trailing = [...thread, { id: "5", role: "user", text: "thanks" }];
    expect(answerAfter(trailing, "log the pulled pork").every((m) => m.role === "assistant")).toBe(true);
  });
});
