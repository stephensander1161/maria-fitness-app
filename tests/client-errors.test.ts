import { describe as suite, expect, it, vi, afterEach } from "vitest";
import { streamCoach } from "@/lib/client";

/**
 * The coach failing in silence is the worst failure this app has, because the
 * chat is the app: a message that appears to send and is never answered reads
 * as being ignored.
 *
 * Every one of these responses used to yield zero events and exit cleanly —
 * the parser looked for `data:` frames, a JSON error body has none, and the
 * caller counted the turn as delivered.
 */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const drain = async (): Promise<string[]> => {
  const out: string[] = [];
  for await (const e of streamCoach({ message: "hi" })) out.push(e.type);
  return out;
};

afterEach(() => { vi.unstubAllGlobals(); });

suite("the coach never fails silently", () => {
  it("throws when the daily spend cap answers 429", async () => {
    vi.stubGlobal("fetch", async () => json(429, { error: "That's today's coach budget used up." }));
    await expect(drain()).rejects.toThrow("That's today's coach budget used up.");
  });

  it("throws when the session has expired", async () => {
    vi.stubGlobal("fetch", async () => json(401, { error: "Unauthorized" }));
    await expect(drain()).rejects.toThrow("Unauthorized");
  });

  it("still says something when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>gateway</html>", { status: 502 }));
    await expect(drain()).rejects.toThrow(/502/);
  });

  it("reads a real stream normally", async () => {
    const frames = [
      `data: ${JSON.stringify({ type: "text", text: "hello" })}\n\n`,
      `data: ${JSON.stringify({ type: "done" })}\n\n`,
    ].join("");
    vi.stubGlobal("fetch", async () =>
      new Response(frames, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    expect(await drain()).toEqual(["text", "done"]);
  });
});
