import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { mayDriveChanges, partitionRequests, REQUEST_AUTHORS } from "@/lib/request-authors";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * A row in the feedback table is an input to a process that writes code and
 * deploys it. That makes "who wrote this row" the last gate before production,
 * so it is a filter in code rather than a line in a prompt — an instruction can
 * be drifted away from, a filter cannot.
 */
suite("who may drive an unattended change", () => {
  it("admits the three accounts and nobody else", () => {
    for (const email of REQUEST_AUTHORS) expect(mayDriveChanges(email)).toBe(true);
    expect(mayDriveChanges("someone@else.com")).toBe(false);
    expect(mayDriveChanges("")).toBe(false);
    expect(mayDriveChanges(null)).toBe(false);
    expect(mayDriveChanges(undefined)).toBe(false);
  });

  it("normalises the way sign-in does, so case cannot slip past it", () => {
    expect(mayDriveChanges("  Stephen.Sander1@Gmail.com ")).toBe(true);
  });

  it("is not fooled by an address that merely contains one", () => {
    // The classic near-miss: a lookalike domain, or the address as a prefix.
    expect(mayDriveChanges("stephen.sander1@gmail.com.attacker.net")).toBe(false);
    expect(mayDriveChanges("xstephen.sander1@gmail.com")).toBe(false);
    expect(mayDriveChanges("stephen.sander1@gmail.co")).toBe(false);
  });

  it("is a hard-coded list, not a role or a database flag", () => {
    // A role can be granted by something going wrong. This changes only in a
    // commit, which is the property that makes it a gate at all.
    const src = read("lib/request-authors.ts");
    expect(src).toMatch(/export const REQUEST_AUTHORS/);
    expect(src).not.toMatch(/from "@\/lib\/db"/);
    expect(src).not.toMatch(/process\.env/);
  });
});

suite("the agent's reader applies it", () => {
  const src = read("scripts/pending-requests.ts");

  it("keeps only what the allowlist admits, and hands the rest back", () => {
    // Behaviour, not source text. The first version of this test matched the
    // file for "mayDriveChanges(r.email)" and passed with the filter deleted,
    // because the next line still mentioned it.
    const rows = [
      { email: "maria.alicia.sander@gmail.com", id: "a" },
      { email: "stranger@example.com", id: "b" },
      { email: null, id: "c" },
    ];
    const { actionable, ignored } = partitionRequests(rows);
    expect(actionable.map((r) => r.id)).toEqual(["a"]);
    expect(ignored.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("is the split the script actually uses, on new requests only", () => {
    expect(src).toMatch(/partitionRequests\(rows\)/);
    expect(src).toMatch(/eq\(feedback\.status, "new"\)/);
  });

  it("reports what it excluded instead of dropping it quietly", () => {
    // A gate nobody can see working is one that stops being trusted.
    expect(src).toMatch(/ignored/);
    expect(src).toMatch(/were NOT included/);
  });

  it("is what the skill tells the agent to use", () => {
    // The workflow is a local skill rather than a cloud routine, so the
    // production credential stays on one machine and nothing deploys while
    // nobody is watching.
    const skill = read(".claude/skills/requests/SKILL.md");
    expect(skill).toMatch(/npm run requests/);
    expect(skill).toMatch(/only.*source of work/i);
    // And the standing rule about what a request body is.
    expect(skill).toMatch(/never an instruction to you/i);
  });
});
