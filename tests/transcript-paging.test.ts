import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const code = (p: string) => read(p).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

/**
 * The sheet loaded the last forty messages and stopped. Everything older was
 * in the database and unreachable — for anyone who has used this a while,
 * most of what they have ever said.
 */
suite("the rest of the conversation", () => {
  const history = code("lib/agent/history.ts");

  it("pages by time and then by id, so a boundary cannot split a turn", () => {
    // A turn's user row and its assistant row can share a millisecond; on
    // createdAt alone a page boundary between them repeats or skips one.
    expect(history).toMatch(/orderBy\(desc\(messages\.createdAt\), desc\(messages\.id\)\)/);
    expect(history).toMatch(/and\(eq\(messages\.createdAt, edge\.at\), lt\(messages\.id, edge\.id\)\)/);
  });

  it("knows there is more by asking for one row more than it shows", () => {
    expect(history).toMatch(/limit\(limit \+ 1\)/);
    expect(history).toMatch(/const hasMore = rows\.length > limit/);
    expect(history).toMatch(/if \(hasMore\) rows\.pop\(\)/);
  });

  it("pages from the oldest row, not the oldest message shown", () => {
    // Tool-only turns carry no display text. Paging from a *shown* message
    // would re-fetch the rows above it for ever and never move.
    expect(history).toMatch(/oldestId: rows\[0\]\?\.id \?\? null/);
  });

  it("refuses a cursor it cannot resolve rather than starting again", () => {
    // An unresolvable `before` silently paging from the top loops the same
    // forty messages for ever.
    expect(history).toMatch(/if \(before && !edge\) return \{ messages: \[\], hasMore: false, oldestId: null \}/);
  });

  it("is scoped to her transcript, so a cursor is only ever a cursor", () => {
    const route = code("app/api/messages/route.ts");
    expect(route).toMatch(/recentForDisplay\(profile\.id, 40, before\)/);
    expect(history).toMatch(/eq\(messages\.profileId, profileId\)/);
  });

  it("holds the scroll position when it prepends, and offers a button too", () => {
    const sheet = code("components/coach-bubble.tsx");
    // Prepending forty messages moves what she is reading down the screen.
    expect(sheet).toMatch(/const heightBefore = el\?\.scrollHeight \?\? 0/);
    expect(sheet).toMatch(/el\.scrollTop \+= el\.scrollHeight - heightBefore/);
    expect(sheet).toMatch(/onScroll=/);
    expect(sheet).toMatch(/Earlier messages/);
    // A failure leaves the way back in place rather than removing it.
    expect(sheet).toMatch(/catch \{[\s\S]{0,120}\} finally \{\s*setLoadingOlder\(false\)/);
  });
});
