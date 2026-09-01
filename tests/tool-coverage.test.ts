import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { anthropicTools, registry } from "@/lib/tools";
import * as schema from "@/lib/db/schema";

/**
 * Structural guarantees about the tool registry.
 *
 * The app's premise is that she can do anything by asking the coach instead of
 * tapping. That only stays true if every new feature ships its tools alongside
 * its screens — and a rule written in a document does not survive contact with
 * the next feature. These tests do.
 */

const read = (p: string) => fs.readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = [...walk("components"), ...walk("app"), ...walk("lib")];

/** Every `action("some_tool", …)` the browser can invoke. */
function uiInvocations(): { tool: string; file: string }[] {
  const found: { tool: string; file: string }[] = [];
  for (const file of sourceFiles) {
    for (const m of read(file).matchAll(/\baction\s*<[^>]*>\s*\(\s*"([a-z_]+)"|\baction\s*\(\s*"([a-z_]+)"/g)) {
      found.push({ tool: m[1] ?? m[2], file });
    }
  }
  return found;
}

suite("tool registry", () => {
  it("every tool the UI calls exists in the registry", () => {
    const missing = uiInvocations().filter((c) => !registry.has(c.tool));
    expect(
      missing.map((m) => `${m.tool} (${m.file})`),
      "the UI must never reach a handler outside the registry",
    ).toEqual([]);
  });

  it("hiding a tool from the model requires a stated reason", () => {
    const hidden = [...registry.values()].filter((t) => t.uiOnly !== undefined);
    for (const tool of hidden) {
      expect(typeof tool.uiOnly, `${tool.name}`).toBe("string");
      expect(
        (tool.uiOnly ?? "").trim().length,
        `${tool.name}: uiOnly must say why the model cannot do this`,
      ).toBeGreaterThan(20);
    }
  });

  it("only genuinely impossible actions are hidden from the model", () => {
    // Deliberately a hard-coded list. Adding to it should require reading the
    // reason and agreeing that the model truly cannot perform the action —
    // "the UI does it" is not a reason, or nearly everything would qualify.
    const ALLOWED_HIDDEN = ["add_progress_photo"];
    const hidden = [...registry.values()].filter((t) => t.uiOnly).map((t) => t.name).sort();
    expect(
      hidden,
      "a new uiOnly tool narrows what she can delegate to the coach — justify it here",
    ).toEqual(ALLOWED_HIDDEN);
  });

  it("every table that holds her data is written by some tool", () => {
    // Reference data is seeded, not written through tools.
    const REFERENCE_ONLY = new Set(["exercises", "facts"]);
    // Infrastructure the app maintains itself, never on her behalf.
    const INTERNAL = new Set([
      "messages", "rateEvents", "usageDaily", "factViews", "profiles",
      // Written by the app about itself, never on her behalf. Exposing an
      // audit log to the model would let a prompt reach the security record.
      "auditLog",
    ]);

    const toolSource = walk("lib/tools").map(read).join("\n");
    const uncovered = Object.keys(schema)
      .filter((name) => {
        const table = (schema as Record<string, unknown>)[name];
        return table !== null && typeof table === "object" && "getSQL" in (table as object);
      })
      .filter((name) => !REFERENCE_ONLY.has(name) && !INTERNAL.has(name))
      .filter((name) => !toolSource.includes(name));

    expect(
      uncovered,
      "a new feature added a table but no tools — the coach cannot reach it",
    ).toEqual([]);
  });

  it("tool names are unique and the list order is stable", () => {
    const names = anthropicTools.map((t) => t.name);
    expect(new Set(names).size, "duplicate tool name").toBe(names.length);

    // Order is the first thing hashed for prompt caching (tools → system →
    // messages), so a reshuffle silently invalidates the cache on every request.
    expect(names, "keep lib/tools/index.ts alphabetical by tool name")
      .toEqual([...names].sort());
  });

  it("every tool describes itself well enough to be chosen correctly", () => {
    for (const tool of registry.values()) {
      expect(tool.description.length, `${tool.name} needs a real description`)
        .toBeGreaterThan(60);
      // Descriptions that lead with a constraint get read as a refusal — this
      // is exactly how set_coach_budget came to answer "I can't do that".
      expect(tool.description.trimStart().slice(0, 40).toLowerCase())
        .not.toMatch(/^(cannot|can't|do not|don't|never)\b/);
    }
  });
});
