import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  canSeeTraining, edgeState, formatCode, generateShareCode, isWellFormedCode,
  normaliseCode, otherSide, type FriendshipRow,
} from "@/lib/friends";
import { registry } from "@/lib/tools";

const read = (p: string) => fs.readFileSync(p, "utf8");

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";

const row = (over: Partial<FriendshipRow> = {}): FriendshipRow => ({
  id: "f1", requesterId: A, addresseeId: B, status: "accepted", respondedAt: new Date(), ...over,
});

/**
 * Friends are the one place one person's data reaches another, so the rules
 * about who sees what are tested rather than trusted.
 */
suite("who may see whose training", () => {
  it("lets each side of an accepted friendship see the other", () => {
    expect(canSeeTraining(row(), A)).toBe(true);
    expect(canSeeTraining(row(), B)).toBe(true);
  });

  it("refuses a pending request outright", () => {
    // Asking must never be enough, or the request itself is the leak.
    expect(canSeeTraining(row({ status: "pending", respondedAt: null }), A)).toBe(false);
    expect(canSeeTraining(row({ status: "pending", respondedAt: null }), B)).toBe(false);
  });

  it("refuses somebody who is not in the pair", () => {
    expect(canSeeTraining(row(), C)).toBe(false);
  });

  it("refuses when there is no friendship at all", () => {
    expect(canSeeTraining(null, A)).toBe(false);
  });

  it("names the other side from either end, and nobody from outside", () => {
    expect(otherSide(row(), A)).toBe(B);
    expect(otherSide(row(), B)).toBe(A);
    expect(otherSide(row(), C)).toBeNull();
  });

  it("says who is waiting on whom", () => {
    const pending = row({ status: "pending", respondedAt: null });
    expect(edgeState(pending, A)).toBe("you-asked");
    expect(edgeState(pending, B)).toBe("they-asked");
    expect(edgeState(row(), A)).toBe("friend");
  });
});

suite("the code someone types to add her", () => {
  it("avoids the characters people misread", () => {
    // No I, L, O or U: nothing can be read back as something else, and no
    // code can accidentally spell a word.
    for (let i = 0; i < 200; i++) {
      expect(generateShareCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, generateShareCode));
    expect(seen.size).toBe(500);
  });

  it("accepts a code the way somebody reads it out", () => {
    // Spaces, dashes, lower case and the letters people write for digits are
    // all the same code. Answering "no such code" to a correctly-read one is
    // how a feature gets used once.
    const code = "4RJ2K8QW";
    for (const typed of ["4RJ2K8QW", "4rj2k8qw", "4RJ2-K8QW", " 4rj2 k8qw ", "4RJ2_K8QW"]) {
      expect(normaliseCode(typed), typed).toBe(code);
    }
    expect(normaliseCode("O1IL2345")).toBe("01112345");
  });

  it("rejects anything that is not a code", () => {
    expect(isWellFormedCode(normaliseCode(""))).toBe(false);
    expect(isWellFormedCode(normaliseCode("short"))).toBe(false);
    expect(isWellFormedCode(normaliseCode("4RJ2K8QW"))).toBe(true);
  });

  it("groups it for reading aloud without changing it", () => {
    expect(formatCode("4RJ2K8QW")).toBe("4RJ2-K8QW");
    expect(normaliseCode(formatCode("4RJ2K8QW"))).toBe("4RJ2K8QW");
  });
});

suite("training crosses, a body never does", () => {
  const source = read("lib/friends.ts");

  it("the shared shape has no field that could carry body data", () => {
    // The type is the control. If it cannot name weight, a measurement, a
    // photo or a meal, no amount of query drift can ship one.
    const shape = source.slice(source.indexOf("export type FriendTraining"), source.indexOf("export type FriendEdge"));
    for (const banned of [
      "weightKg", "bodyFat", "waist", "hips", "measurement", "photo",
      "calories", "protein", "meal", "cycle", "injur", "goalWeight", "startWeight",
    ]) {
      expect(shape.toLowerCase(), `FriendTraining must not carry ${banned}`)
        .not.toContain(banned.toLowerCase());
    }
    // ...and it does carry the training facts it is for.
    expect(shape).toMatch(/sessionsThisWeek/);
    expect(shape).toMatch(/streakWeeks/);
  });

  it("never selects a body table for a friend", () => {
    // Checked against the code, not the comment above it that states the rule.
    const code = source.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    for (const table of ["weighIns", "measurements", "photos", "mealLogs", "cycleEvents", "complaints"]) {
      expect(code, `lib/friends.ts must not read ${table}`).not.toContain(table);
    }
  });

  it("reads a friend's week in the friend's timezone", () => {
    // Judged against a viewer six hours west, a Sunday evening session falls
    // outside the week it was done in.
    expect(source).toMatch(/profileToday\(friend\)/);
  });

  it("reports a friend's lifts in the viewer's units", () => {
    // The viewer is the one reading them; someone else's units is a number
    // she misreads without noticing.
    expect(source).toMatch(/weightOut\(b\.weightKg, viewerUnits\)/);
  });

  it("distinguishes a quiet week from never having started", () => {
    expect(source).toMatch(/hasEverLogged/);
    expect(read("components/friends-client.tsx")).toMatch(/Hasn&apos;t logged a session yet|Hasn't logged a session yet/);
  });
});

suite("the tools enforce it too", () => {
  const source = read("lib/tools/friends.ts");

  it("registers the whole feature, not just the reads", () => {
    for (const name of [
      "get_share_code", "reset_share_code", "add_friend", "list_friends",
      "respond_to_friend_request", "remove_friend", "get_friend_stats",
    ]) {
      expect(registry.has(name), `${name} is not registered`).toBe(true);
    }
  });

  it("checks the friendship before handing over any stats", () => {
    const handler = source.slice(source.indexOf('name: "get_friend_stats"'));
    expect(handler).toMatch(/canSeeTraining\(row, ctx\.profileId\)/);
  });

  it("only the person who was asked can answer a request", () => {
    // Otherwise a requester could accept on the other person's behalf.
    const handler = source.slice(source.indexOf('name: "respond_to_friend_request"'));
    expect(handler).toMatch(/eq\(friendships\.addresseeId, ctx\.profileId\)/);
  });

  it("scopes every write to the profile in the query itself", () => {
    for (const m of source.matchAll(/db\s*\.(update|delete)\(friendships\)[\s\S]*?\.where\(([\s\S]*?)\)\s*\n/g)) {
      expect(m[2], `an unscoped ${m[1]} on friendships`).toMatch(/ctx\.profileId/);
    }
  });

  it("gives one answer to an unknown code and to her own", () => {
    // Two different answers would make the field a way to sweep for codes
    // that exist.
    const handler = source.slice(source.indexOf('name: "add_friend"'));
    expect(handler).toMatch(/!target \|\| target\.id === ctx\.profileId/);
  });

  it("records the sharing, because it is data leaving her profile", () => {
    for (const event of ["friend.requested", "friend.accepted", "friend.removed"]) {
      expect(source).toContain(event);
    }
    expect(read("lib/audit.ts")).toContain("friend.accepted");
  });

  it("never reaches the accounts table", () => {
    // Same rule as every other tool module: a friend is a profile, and an
    // email lookup would make any signed-in account an enumeration oracle.
    expect(source).not.toMatch(/\busers\b/);
  });
});
