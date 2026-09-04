import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { money } from "@/lib/admin";
import { registry } from "@/lib/tools";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * The owner's console is the one screen that shows one person data about
 * another. Two things hold it up, and both are checked here rather than
 * believed: only an owner reaches it, and what it shows is operational.
 */
suite("only the owner reaches the console", () => {
  const lib = read("lib/admin.ts");
  const page = read("app/admin/page.tsx");

  it("checks the role, not merely that someone is signed in", () => {
    // Middleware only proves there is a valid session. Every signed-in account
    // has one, so without this every member could read everyone's summary.
    expect(lib).toMatch(/user\.role !== "owner"/);
    expect(lib).toMatch(/redirect\("\/"\)/);
  });

  it("is the gate the page actually calls", () => {
    expect(page).toMatch(/await requireOwner\(\)/);
    // ...and it runs before anything is read. Measured inside the component,
    // not across the whole file, where the import line comes first.
    const body = page.slice(page.indexOf("export default async function"));
    expect(body.indexOf("requireOwner")).toBeLessThan(body.indexOf("adminOverview"));
  });

  it("records that someone read other people's records", () => {
    expect(page).toMatch(/audit\("admin\.viewed"/);
    expect(read("lib/audit.ts")).toContain("admin.viewed");
  });

  it("shows the entry point only to an owner", () => {
    const nav = read("components/side-nav.tsx");
    expect(nav).toMatch(/\{isOwner && \(/);
    expect(read("components/side-nav-gate.tsx")).toMatch(/isOwner=\{user\.role === "owner"\}/);
  });
});

suite("the console is operational, never personal", () => {
  const lib = read("lib/admin.ts");
  const page = read("app/admin/page.tsx");
  const code = lib.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

  it("never selects anyone's body or training detail", () => {
    // Counts and dates answer "is this working for them". The numbers
    // themselves are theirs, and being the owner is not consent.
    for (const column of [
      "weightKg", "startWeightKg", "goalWeightKg", "heightCm", "bodyFat",
      "photos.image", "measurements.value", "mealLogs.description", "messages.content",
      "complaints", "cycleEvents", "injuries", "motivation",
    ]) {
      expect(code, `lib/admin.ts must not read ${column}`).not.toContain(column);
    }
  });

  it("counts rows rather than reading them", () => {
    // weighIns and mealLogs are reached, but only ever through count() or a
    // count of distinct days — never a select of the values.
    expect(code).toMatch(/count\(\)/);
    expect(code).not.toMatch(/select\(\)\s*\.from\(weighIns\)/);
    expect(code).not.toMatch(/select\(\)\s*\.from\(mealLogs\)/);
    expect(code).not.toMatch(/select\(\)\s*\.from\(messages\)/);
  });

  it("says whether a password exists, never anything about it", () => {
    expect(code).toMatch(/u\.passwordHash \? \["password" as const\] : \[\]/);
    // The hash must not travel to the browser inside the row.
    const shape = lib.slice(lib.indexOf("export type AccountRow"), lib.indexOf("export type AdminOverview"));
    expect(shape).not.toMatch(/passwordHash|googleSub|hash/);
  });

  it("tells the reader what it is deliberately not showing", () => {
    expect(page).toMatch(/never shows anyone/i);
  });

  it("is unreachable by the model", () => {
    // `users` is out of the model's reach, so this is a page-only read model
    // and there is no tool that could hand any of it to a prompt.
    const suspicious = [...registry.keys()].filter((n) => /admin|every_?user|all_users/.test(n));
    expect(suspicious).toEqual([]);
    for (const file of fs.readdirSync("lib/tools")) {
      expect(read(`lib/tools/${file}`), `${file} imports the admin read model`)
        .not.toMatch(/@\/lib\/admin/);
    }
  });
});

suite("money", () => {
  it("renders millionths of a dollar as money", () => {
    expect(money(0)).toBe("$0.00");
    expect(money(1_000_000)).toBe("$1.00");
    expect(money(12_345)).toBe("$0.01");
  });
});
