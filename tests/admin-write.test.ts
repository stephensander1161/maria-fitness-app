import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("app/api/admin/account/route.ts", "utf8");
const ui = fs.readFileSync("components/account-controls.tsx", "utf8");

suite("the owner can change a budget from the screen", () => {
  it("is a route and never a tool", () => {
    /*
      A top-up is the only thing that can take somebody above the deployment's
      ceiling, and a role is what gates the console. A prompt that could grant
      either is a prompt that could buy itself an unlimited day, or promote
      itself. Account deletion is a route for the same reason.
    */
    expect(fs.readFileSync("lib/tools/index.ts", "utf8")).not.toMatch(/adminAccount|setRole|grantTopUp/);
    expect(route).toMatch(/await requireOwner\(\)/);
  });

  it("uses the same arithmetic as the command line", () => {
    // So the screen cannot be the permissive way in: a budget still only
    // tightens the ceiling, and a top-up is still capped, from one function.
    expect(route).toMatch(/budgetFor\(value, LIMITS\.dailyCostMicros\)/);
    expect(route).toMatch(/topUpFor\(value\)/);
    // Not reimplemented here.
    expect(route).not.toMatch(/MAX_TOP_UP_MICROS\s*=/);
    expect(route).not.toMatch(/Number\(value\)/);
  });

  it("refuses to remove the last owner", () => {
    // Nothing on this screen could put the console back — only the command
    // line can.
    expect(route).toMatch(/That is the only owner/);
    expect(route).toMatch(/count\(\*\)::int/);
  });

  it("makes a role change say the account's name out loud", () => {
    // A list of people with a button beside each of them: the mistake worth
    // guarding is granting the console to the wrong row, which is silent.
    expect(route).toMatch(/confirmEmail \?\? ""\).trim\(\).toLowerCase\(\) !== target\.email\.toLowerCase\(\)/);
    expect(ui).toMatch(/Type \$\{email\} to confirm/);
  });

  it("records all three", () => {
    // Changing what somebody may spend, or who can read this log, is exactly
    // the class of action COMPLIANCE.md says must be audited.
    for (const event of ["admin.budget_set", "admin.top_up_granted", "admin.role_changed"]) {
      expect(route, event).toContain(event);
    }
    expect(fs.readFileSync("lib/audit.ts", "utf8")).toMatch(/"admin\.role_changed",\n\];/);
  });

  it("clears the ask when it answers it", () => {
    // Otherwise the console goes on showing somebody as waiting for a thing
    // they have already been given.
    expect(route).toMatch(/topUpRequestedOn: null/);
  });
});

suite("the owner is woken when somebody asks", () => {
  const tool = fs.readFileSync("lib/tools/top-up.ts", "utf8");
  const alert = fs.readFileSync("lib/owner-alert.ts", "utf8");
  const sw = fs.readFileSync("public/sw.js", "utf8");

  it("never lets a push failure become her error", () => {
    // She asked; the ask is on the console either way. A push service having
    // a bad minute must not turn "asked" into "that didn't work".
    expect(tool).toMatch(/void alertOwners\(\)\.catch\(/);
  });

  it("finds the owners outside the registry", () => {
    // No module in lib/tools may touch `users` — the invariant is structural,
    // so no prompt can reach an account however cleverly it is asked.
    expect(tool).not.toMatch(/\busers\b/);
    expect(alert).toMatch(/eq\(users\.role, "owner"\)/);
  });

  it("still sends an empty envelope", () => {
    // Nothing about anybody passes through Apple's or Google's push service.
    // The worker asks the app what the notification is about when it lands.
    expect(sw).toMatch(/fetch\("\/api\/push\/pending"/);
    expect(sw).toMatch(/credentials: "include"/);
    expect(fs.readFileSync("lib/push.ts", "utf8")).toMatch(/"Content-Length": "0"/);
  });

  it("still says something when it cannot ask", () => {
    // Offline, or the session has gone. A woken device that says nothing is
    // worse than one that says the likely thing.
    expect(sw).toMatch(/let say = FALLBACK;/);
    expect(sw).toMatch(/Time to weigh in/);
  });

  it("only tells an owner about the asks", () => {
    const pending = fs.readFileSync("app/api/push/pending/route.ts", "utf8");
    expect(pending).toMatch(/user\.role === "owner"/);
    expect(pending).toMatch(/status: 401/);
  });
});
