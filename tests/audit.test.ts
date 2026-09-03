import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The audit log is the only record of who did what to her data, and
 * COMPLIANCE.md makes two promises about it that nothing was checking:
 * everything security-relevant is recorded, and nothing sensitive is.
 *
 * Both are structural properties of the call sites rather than of the
 * function, so that is where they are checked.
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
const sources = [...walk("lib"), ...walk("app"), ...walk("scripts")];
/**
 * Every audit() call and its arguments. Extracted by matching brackets rather
 * than by a shape-guess: the first version of this regex needed the call to
 * end on its own line and silently skipped every single-line one, which is
 * most of them — a test that inspects call sites is worth nothing if it
 * cannot find them.
 */
const auditCalls = sources.flatMap((file) => {
  const src = read(file);
  const out: { file: string; event: string; call: string }[] = [];
  for (const m of src.matchAll(/\baudit\(\s*"([a-z._]+)"/g)) {
    let depth = 0;
    let i = m.index! + m[0].length - m[1].length - 2;
    // Walk from the opening paren to its match.
    i = src.indexOf("(", m.index!);
    for (let j = i; j < src.length && j < i + 2000; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) { out.push({ file, event: m[1], call: src.slice(m.index!, j + 1) }); break; }
      }
    }
  }
  return out;
});

suite("what gets written down", () => {
  it("records every deletion of her data", () => {
    // Anything that destroys her rows has to leave a trace, or the log is a
    // record of successful logins and nothing that matters.
    const deleters = walk("lib/tools").filter((f) => /db\s*\n?\s*\.delete\(/.test(read(f)));
    const audited = deleters.filter((f) => /audit\(/.test(read(f)));
    const silent = deleters.filter((f) => !audited.includes(f));
    expect(
      silent,
      `these delete her data without recording it: ${silent.join(", ")}`,
    ).toEqual([]);
  });

  it("records data leaving the app", () => {
    const events = new Set(auditCalls.map((c) => c.event));
    expect(events).toContain("data.shared");
    expect(events).toContain("data.exported");
    expect(events).toContain("data.deleted");
  });

  it("marks the events worth noticing as warnings", () => {
    const src = read("lib/audit.ts");
    for (const event of ["login.failure", "login.rate_limited", "data.deleted"]) {
      expect(src).toContain(`"${event}"`);
    }
    expect(src).toMatch(/const WARN[\s\S]{0,200}data\.deleted/);
  });
});

suite("what must never be written down", () => {
  /**
   * Reviewed exceptions, each with the reason it is not what it looks like.
   * Deliberately a hard-coded list rather than a cleverer matcher: the point
   * is that a person read the call and decided, which is the same reason the
   * uiOnly allowlist is written out longhand.
   */
  const REVIEWED = new Map<string, string>([
    [
      "app/api/login/route.ts:login.failure",
      "tests whether a hash exists to classify the failure; the hash itself is never a value",
    ],
    [
      "lib/tools/corrections.ts:data.deleted",
      'the word "measurement" is the scope label, not a reading',
    ],
  ]);
  const unreviewed = (c: { file: string; event: string }) => !REVIEWED.has(`${c.file}:${c.event}`);

  it("no call site passes a credential", () => {
    // A log of near-misses is a wordlist. This is the rule COMPLIANCE.md
    // states most emphatically, and it had no test.
    const banned = /\b(password|passphrase|passwordHash|hash|token|secret|apiKey|api_key)\b/i;
    const offenders = auditCalls.filter((c) => banned.test(c.call)).filter(unreviewed);
    expect(
      offenders.map((o) => `${o.file}: ${o.event}`),
      "credentials must never reach the audit log",
    ).toEqual([]);
  });

  it("no call site passes her body or training data", () => {
    const banned = /\b(weightKg|weight|calories|proteinG|bodyFat|measurement|waist|hips|reps|birthYear)\b/;
    const offenders = auditCalls.filter((c) => banned.test(c.call)).filter(unreviewed);
    expect(
      offenders.map((o) => `${o.file}: ${o.event}`),
      "the audit log records what happened, never her numbers",
    ).toEqual([]);
  });

  it("logs a masked address rather than her email", () => {
    // The Google callback needs to say *which* address was refused an invite,
    // and does it as m***@gmail.com.
    const callback = read("app/api/auth/google/callback/route.ts");
    expect(callback).toMatch(/maskEmail/);
    const detail = callback.slice(callback.indexOf("not_invited") - 200, callback.indexOf("not_invited") + 200);
    expect(detail).not.toMatch(/detail:\s*\{[^}]*\bemail\b\s*\}/);
  });

  it("truncates the user agent instead of fingerprinting", () => {
    expect(read("lib/audit.ts")).toMatch(/user-agent[\s\S]{0,80}slice\(0, 160\)/);
  });

  it("never lets logging break the thing it is describing", () => {
    // An audit failure must not fail a sign-in or a deletion.
    const src = read("lib/audit.ts");
    const fn = src.slice(src.indexOf("export async function audit"));
    expect(fn).toMatch(/try \{[\s\S]*\} catch/);
  });
});
