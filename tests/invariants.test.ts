import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODEL, PLANNER_MODEL, PRICING, PLANNER_PRICING, ratesFor } from "@/lib/agent/model";
import { registry } from "@/lib/tools";

/**
 * The rules CLAUDE.md states, enforced.
 *
 * Every one of these was written down and believed, and would have shipped
 * green: the pricing pairing that two documents claimed a test asserted, the
 * `users` table two documents claimed was out of the model's reach, the
 * deny-by-default gate nothing imported, and the timezone rule whose test
 * only ever walked one directory.
 */
const read = (p: string) => fs.readFileSync(p, "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
};

suite("the spend cap is priced for the model that actually runs", () => {
  it("prices whatever COACH_MODEL is set to, not a hand-written constant", () => {
    // The old table was two literals with a comment saying they must be kept
    // in step. Point COACH_MODEL at Opus and output billed at $5/M instead of
    // $25/M: the ceiling allows five times the spend it is supposed to.
    expect(PRICING).toEqual(ratesFor(MODEL));
    expect(PLANNER_PRICING).toEqual(ratesFor(PLANNER_MODEL));
  });

  it("charges an unrecognised model at the top of the range", () => {
    // Over-charging stops her coach early. Under-charging spends money nobody
    // is watching, which is the failure that matters.
    const unknown = ratesFor("claude-something-new-9");
    expect(unknown.output).toBeGreaterThanOrEqual(ratesFor("claude-sonnet-5").output);
  });

  it("bills each family at its own rate", () => {
    expect(ratesFor("claude-haiku-4-5").output).toBe(5);
    expect(ratesFor("claude-sonnet-5").output).toBe(10);
    expect(ratesFor("claude-opus-5").output).toBe(25);
  });
});

suite("every model call is gated before it is made", () => {
  it("no module calls the Anthropic SDK without a spend check", () => {
    // The planner shipped once with recordUsage and no gate: spend went onto
    // the ledger with nothing reading it back.
    const callers = walk("lib").filter((f) => /\.messages\.(create|stream)\(/.test(read(f)));
    expect(callers.length, "expected the known model-calling modules").toBeGreaterThan(0);

    const ungated = callers.filter((f) => !/check(Spend|Chat)Allowed/.test(read(f)));
    expect(
      ungated,
      `these buy tokens without checking the ceiling first: ${ungated.join(", ")}`,
    ).toEqual([]);
  });

  it("every model call records what it spent", () => {
    const callers = walk("lib").filter((f) => /\.messages\.(create|stream)\(/.test(read(f)));
    const unrecorded = callers.filter((f) => !/recordUsage\(/.test(read(f)));
    expect(unrecorded, `these spend without billing it: ${unrecorded.join(", ")}`).toEqual([]);
  });
});

suite("the gate denies by default", () => {
  const src = read("middleware.ts");

  it("is a public allowlist, never a protected list", () => {
    // An allowlist of *protected* paths means a new route is public until
    // somebody remembers it. This shape means the opposite.
    expect(src).toMatch(/PUBLIC_PATHS\.has\(pathname\)/);
    // The inverse shape — a list of paths to protect — would leave every new
    // route public until somebody remembered it. Checked against the code, not
    // the prose above it.
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/PROTECTED_PATHS|isProtected/i);
  });

  it("keeps the public surface to the doors and the icons", () => {
    // A snapshot on purpose: adding to this set exposes something to the
    // internet, and that should be a deliberate edit to a test, not a diff
    // nobody looked at twice.
    const listed = [...src.matchAll(/^\s*"(\/[^"]*)",/gm)].map((m) => m[1]).sort();
    expect(listed).toEqual([
      "/api/auth/google",
      "/api/auth/google/callback",
      "/api/login",
      "/apple-icon",
      "/favicon.ico",
      "/icon",
      "/icon-192",
      "/icon-512",
      "/login",
      "/manifest.webmanifest",
      "/robots.txt",
      "/sw.js",
    ]);
  });

  it("fails closed when AUTH_SECRET is missing", () => {
    expect(src).toMatch(/if \(!secret\)/);
    expect(src).toMatch(/status: 503/);
  });
});

suite("the model cannot reach accounts", () => {
  it("no registered tool touches the users table", () => {
    // CLAUDE.md and COMPLIANCE.md both claimed this was asserted. It was not:
    // `users` sat in an *exclusion* list, exempting it from needing tools, and
    // a tool importing it and rewriting a password hash passed every check.
    const offenders = walk("lib/tools").filter((f) => /\busers\b/.test(read(f)));
    expect(
      offenders,
      `these tool modules reference the users table: ${offenders.join(", ")}. ` +
      "No prompt should be able to change a password, enable an account, or read a hash.",
    ).toEqual([]);
  });

  it("has no tool whose name suggests it manages accounts", () => {
    const suspicious = [...registry.keys()].filter((n) =>
      /password|account|user|session|login|disable/.test(n));
    expect(suspicious).toEqual([]);
  });
});

suite("a day-level date is her day, everywhere", () => {
  it("nothing outside a parameter default dates her day on the server's clock", () => {
    // The ban used to walk lib/tools only — which is why the prompt's own
    // state block, the streak and the photo date were all wrong at once.
    const serverDated = /(?<![.\w])(today|weekStart|dayIndex)\s*\(\s*\)/;
    const exempt = new Set([
      // Where the bare default is defined, and where it is deliberately one
      // global window rather than her day.
      "lib/date.ts",
      "lib/limits.ts",
    ]);

    const offenders: string[] = [];
    for (const file of [...walk("lib"), ...walk("components"), ...walk("app")]) {
      if (exempt.has(file)) continue;
      for (const [i, line] of read(file).split("\n").entries()) {
        if (!serverDated.test(line)) continue;
        // `date: ISODate = today()` is the correct shape: a default the caller
        // overrides. A bare call in a statement is not.
        // `date: ISODate = today()` and `opts.asOf ?? today()` are the correct
        // shape: a default the caller overrides. A bare call in a statement,
        // or one written straight into a row, is not.
        const bare = line.replace(/(=|\?\?)\s*(today|weekStart|dayIndex)\(\)/g, "");
        if (!serverDated.test(bare)) continue;
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        offenders.push(`${file}:${i + 1} ${line.trim()}`);
      }
    }
    expect(
      offenders,
      `these date her day on the server's clock:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

suite("the persona stays cacheable", () => {
  it("the frozen half carries the cache breakpoint", () => {
    expect(read("lib/agent/system.ts")).toMatch(/cache_control/);
  });

  it("nothing volatile is interpolated into the frozen half", () => {
    // A timestamp in the persona changes the prefix on every request and
    // silently kills the cache — no error, just a bill.
    const src = read("lib/agent/system.ts");
    const persona = src.slice(src.indexOf("const PERSONA"), src.indexOf("export function buildSystem"));
    expect(persona).not.toMatch(/new Date\(|Date\.now\(|\$\{/);
  });
});

suite("pages that read the database are dynamic", () => {
  it("every page with a database read declares force-dynamic", () => {
    const pages = walk("app").filter((f) => /page\.tsx$/.test(f));
    const offenders = pages.filter((f) => {
      const src = read(f);
      const reads = /from "@\/lib\/(db|views|progress|profile|session|photos)"/.test(src);
      return reads && !/export const dynamic = "force-dynamic"/.test(src);
    });
    expect(offenders, `these would be statically cached: ${offenders.join(", ")}`).toEqual([]);
  });
});

suite("the persona is a template literal, so it must survive being one", () => {
  it("contains no unescaped backticks or interpolations", () => {
    // A backtick pasted into the persona — writing `get_next_targets` in
    // markdown, say — ends the template literal and breaks the build. Cheap to
    // do, and the build error points at a line of prose rather than at code.
    const src = fs.readFileSync("lib/agent/system.ts", "utf8");
    const start = src.indexOf("const PERSONA = `") + "const PERSONA = `".length;
    const end = src.indexOf("`;", start);
    const persona = src.slice(start, end);
    expect(persona).not.toMatch(/`/);
    expect(persona).not.toMatch(/\$\{/);
  });
});

suite("every mutation goes through the tool registry", () => {
  it("no API route or page writes to the database directly", () => {
    // The headline rule of this project, and /api/onboard broke it for months
    // — which is *why* the coach could never change her timezone or her start
    // weight: both had a writer that was not a tool, so no tool grew one.
    // The auth routes are the one exception, and it is the inverse of a
    // loophole: `users` is deliberately out of the model's reach, so a tool
    // for stamping lastLoginAt would be a tool for changing a password. Those
    // writes must touch `users` and nothing else.
    const AUTH = /^app\/api\/(login|auth)\//;

    const offenders: string[] = [];
    for (const file of walk("app")) {
      const src = read(file);
      const writes = [...src.matchAll(/\bdb\s*\n?\s*\.\s*(insert|update|delete)\s*\(\s*(\w+)/g)];
      for (const m of writes) {
        const table = m[2];
        if (AUTH.test(file) && table === "users") continue;
        offenders.push(`${file}: db.${m[1]}(${table})`);
      }
    }
    expect(
      offenders,
      `these write outside lib/tools: ${offenders.join(", ")}. Call runTool instead.`,
    ).toEqual([]);
  });

  it("no component writes to the database at all", () => {
    const offenders = walk("components").filter((f) => /from "@\/lib\/db"/.test(read(f)));
    expect(offenders, `components must not touch the database: ${offenders.join(", ")}`).toEqual([]);
  });
});
