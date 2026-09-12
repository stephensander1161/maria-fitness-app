import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const history = read("lib/agent/history.ts");
const loop = read("lib/agent/loop.ts");
const route = read("app/api/chat/route.ts");
const sheet = read("components/coach-bubble.tsx");

/*
  The app had exactly one conversation, for ever. Opening the coach to ask a
  quick question dropped you into the middle of last week, and the only route
  to a clean thread was the "+" — which deleted the transcript, so nobody took
  it and every conversation ran on for months.
*/

suite("every chat is its own thread", () => {
  it("replays only that thread", () => {
    /*
      The whole point: a new chat means the model sees this message and the
      state block, not four months of everything.

      Sliced to `loadHistory` rather than matched against the file: the same
      clause appears in `recentForDisplay`, so a whole-file match passed with
      the replay scope deleted — which is the exact bug this guards.
    */
    const fn = history.slice(
      history.indexOf("export async function loadHistory"),
      history.indexOf("export async function saveMessage"),
    );
    expect(fn).toMatch(/eq\(messages\.conversationId, conversationId\)/);
    expect(loop).toMatch(/loadHistory\(profile\.id, opts\.conversationId \?\? null\)/);
  });

  it("has nothing at all behind a chat that has not started", () => {
    // …and the cache breakpoint therefore sits at the persona, which is
    // exactly where it belongs on the first turn of anything.
    expect(history).toMatch(/if \(!conversationId\) return \[\];/);
  });

  it("opens the thread on the first message, not on the tap", () => {
    // Creating it when the sheet opens would leave an empty row behind every
    // time somebody opened and closed the coach.
    expect(loop).toMatch(/opts\.conversationId \?\? await startConversation\(/);
    expect(sheet).toMatch(/useState<string \| "new">\("new"\)/);
  });

  it("names it after what she typed, never after the screen's briefing", () => {
    // A message sent from a screen carries that screen's contents. Titling
    // from it would give her a history of rows all called "She is looking at
    // today's food" — the app's words, not hers.
    expect(loop).toMatch(/const said = opts\.save \?\? userText;/);
    expect(loop).toMatch(/startConversation\(profile\.id, opts\.silent \? "" : said\)/);
  });

  it("names a thread opened by an inline read once she says something", () => {
    // Those turns are silent, so there is no title to take; without this the
    // thread sits in her history as "Untitled chat" for ever.
    expect(history).toMatch(/isNull\(conversations\.title\)/);
    expect(loop).toMatch(/if \(opts\.conversationId\) await nameIfUntitled\(/);
  });
});

suite("a thread id from the browser is checked before it is read", () => {
  it("on the chat route", () => {
    // The transcript is the most sensitive thing in this app after the
    // photos, and this id arrives from the client on every message.
    expect(route).toMatch(/!\(await ownsConversation\(profile\.id, conversationId\)\)/);
    expect(route).toMatch(/status: 404/);
  });

  it("on the messages route", () => {
    expect(read("app/api/messages/route.ts")).toMatch(/!\(await ownsConversation\(profile\.id, asked\)\)/);
  });

  it("and ownership is a query scoped to her profile, not a check afterwards", () => {
    const fn = history.slice(history.indexOf("export async function ownsConversation"));
    expect(fn.slice(0, 400)).toMatch(/eq\(conversations\.profileId, profileId\)/);
  });
});

suite("the list", () => {
  it("leaves out a thread with nothing she said in it", () => {
    /*
      The same rule `hasHistory` applies to the whole transcript, per thread: a
      turn can fail after the assistant's reply is written, and what is left is
      a row with no question in it. Listing those fills her history with blanks
      she never opened.
    */
    const fn = history.slice(history.indexOf("export async function listConversations"));
    expect(fn).toMatch(/eq\(messages\.role, "user"\)/);
    expect(fn).toMatch(/\.filter\(\(r\) => \(r\.n \?\? 0\) > 0\)/);
  });

  it("counts in one grouped query, not one per row", () => {
    // A list of twenty threads was twenty round trips, on the screen that
    // opens every time she taps the coach.
    const fn = history.slice(history.indexOf("export async function listConversations"));
    expect(fn).toMatch(/\.groupBy\(messages\.conversationId\)/);
    expect(fn).toMatch(/leftJoin\(counts/);
  });

  it("rides along with the transcript rather than costing a second trip", () => {
    expect(read("app/api/messages/route.ts")).toMatch(/Promise\.all\(\[\s*\n\s*recentForDisplay/);
  });
});

suite("the two buttons say what they do", () => {
  it("the plus starts a chat and destroys nothing", () => {
    // It used to call forget_conversation: the only way to a clean thread was
    // erasing everything that had ever been said.
    const plus = sheet.slice(sheet.indexOf('aria-label="New chat"') - 600, sheet.indexOf('aria-label="New chat"'));
    expect(plus).not.toMatch(/forget_conversation/);
    expect(plus).toMatch(/setWant\("new"\)/);
  });

  it("and the destructive one lives at the bottom of what it would destroy", () => {
    expect(sheet).toMatch(/Delete every chat/);
    expect(sheet).toMatch(/Delete every chat\? Your coach forgets all of it/);
  });
});

suite("the thread is backed up and out of the model's reach", () => {
  it("is in the nightly dump", () => {
    expect(read("lib/backup.ts")).toMatch(/conversations/);
  });

  it("is written by the loop, never by a tool", () => {
    // Same as `messages`: the transcript is infrastructure the app maintains
    // about itself. `forget_conversation` and `rewind_conversation` are how
    // the model reaches it, through the rows it can reason about.
    const tools = fs.readdirSync("lib/tools").map((f) => read(`lib/tools/${f}`)).join("\n");
    expect(tools).not.toMatch(/\bconversations\b/);
  });
});
