import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && full.endsWith(".tsx") ? [full] : [];
  });
}

suite("no unicode escape reaches the screen as text", () => {
  it("has no \\uXXXX sitting in a JSX text node", () => {
    /*
      A real one, seen by a real person: the common-mistakes list on a movement
      rendered a literal "·" in front of every bullet.

      `"·"` inside a JS string is the middot. The same six characters
      between a > and a < are not — JSX text is text, and React prints them.
      It got there through a script that wrote the file with the escape
      uninterpreted, which is a mistake no type-checker or linter catches
      because both forms are perfectly valid code.
    */
    const offenders: string[] = [];
    for (const file of [...walk("components"), ...walk("app")]) {
      const src = fs.readFileSync(file, "utf8");
      // Between a closing angle bracket and the next opening one, with no
      // quote or brace in between — that is a JSX text node and nothing else.
      for (const m of src.matchAll(/>[^<>{}"'`]*\\u[0-9a-fA-F]{4}[^<>{}"'`]*</g)) {
        offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders, "write the character, not its escape").toEqual([]);
  });
});
