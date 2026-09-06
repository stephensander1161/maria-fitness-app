import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { COLLECTED, LEGAL, THIRD_PARTIES } from "@/lib/legal";
import { CHROMELESS_PATHS, isChromeless } from "@/lib/chromeless";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * A privacy policy is only worth anything if it is true, so it is checked
 * against the code rather than trusted. The pages are built from lib/legal.ts;
 * these tests hold that file to the schema and to COMPLIANCE.md.
 */
suite("the privacy policy is true", () => {
  it("names every place her data leaves the server, and no place it does not", () => {
    // COMPLIANCE.md enumerates the third parties as a standing rule. The two
    // lists must agree or one of them is lying.
    const compliance = read("COMPLIANCE.md");
    for (const t of THIRD_PARTIES) {
      // "Apple, Google or Mozilla push services" → "Apple"; punctuation off.
      const key = t.name.split(" ")[0].replace(/[^A-Za-z]/g, "");
      expect(compliance, `COMPLIANCE.md does not mention ${t.name}`).toMatch(new RegExp(key, "i"));
    }
    // And the code has no outbound host the policy forgot.
    const src = ["lib/agent/model.ts", "lib/instacart.ts", "lib/push.ts", "lib/oauth.ts"]
      .filter(fs.existsSync).map(read).join("\n");
    const hosts = [...new Set([...src.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]))]
      .filter((h) => !/localhost|example|w3\.org|schema\.org/.test(h));
    const named = THIRD_PARTIES.map((t) => t.name.toLowerCase());
    for (const h of hosts) {
      const covered = named.some((n) => n.split(/[ ,]/).some((w) => w.length > 3 && h.includes(w)))
        || /googleapis|google\.com/.test(h) && named.some((n) => n.includes("google"))
        || /instacart/.test(h) && named.some((n) => n.includes("instacart"))
        || /anthropic/.test(h);
      expect(covered, `the code talks to ${h} but the privacy policy does not say so`).toBe(true);
    }
  });

  it("names the sensitive things it holds, in her words", () => {
    // These are the ones that matter if they are missing. Each corresponds to
    // a table that exists.
    const text = COLLECTED.flatMap((c) => c.items).join(" ").toLowerCase();
    for (const must of ["photo", "cycle", "childbirth", "breastfeeding", "conversation", "weigh", "measurement", "injur", "location"]) {
      expect(text, `the policy does not admit to holding: ${must}`).toContain(must);
    }
  });

  it("never claims something the app does not do", () => {
    // The policy says there is no analytics and no tracking. Keep it true.
    const layout = read("app/layout.tsx");
    expect(layout).not.toMatch(/gtag|analytics|segment|mixpanel|hotjar|fbq/i);
    expect(read("package.json")).not.toMatch(/"@vercel\/analytics"|"posthog|"mixpanel/);
  });

  it("has a real contact and a date that moves", () => {
    expect(LEGAL.contact).toMatch(/@/);
    expect(LEGAL.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL.minimumAge).toBeGreaterThanOrEqual(18);
  });

  it("is public and chromeless, because a reviewer has no account", () => {
    const mw = read("middleware.ts");
    expect(mw).toMatch(/"\/privacy",/);
    expect(mw).toMatch(/"\/terms",/);
    expect(isChromeless("/privacy")).toBe(true);
    expect(isChromeless("/terms")).toBe(true);
    expect(isChromeless("/train")).toBe(false);
    expect(CHROMELESS_PATHS.has("/login")).toBe(true);
  });

  it("is linked from where it has to be", () => {
    for (const f of ["app/login/page.tsx", "app/signup/page.tsx", "app/settings/page.tsx"]) {
      expect(read(f), `${f} does not link the privacy policy`).toMatch(/href="\/privacy"/);
      expect(read(f), `${f} does not link the terms`).toMatch(/href="\/terms"/);
    }
  });

  it("says the coach is not a clinician", () => {
    const terms = read("app/terms/page.tsx");
    expect(terms).toMatch(/Nothing in .* is medical advice/i);
    expect(terms).toMatch(/not a clinician/i);
    expect(terms).toMatch(/childbirth/i);
    expect(terms).toMatch(/physiotherapist/i);
  });
});

suite("deleting an account", () => {
  const route = read("app/api/auth/account/route.ts");

  it("lives with the auth routes, which are the only ones allowed to write users", () => {
    // tests/invariants.test.ts permits `users` writes under app/api/(login|auth)/
    // and nowhere else. This is deliberately a route and not a tool: a prompt
    // must never be able to say "delete my account" on her behalf.
    expect(fs.existsSync("app/api/auth/account/route.ts")).toBe(true);
    for (const f of fs.readdirSync("lib/tools")) {
      expect(read(`lib/tools/${f}`), `${f} deletes users`).not.toMatch(/delete\(users\)/);
    }
  });

  it("requires the phrase, typed", () => {
    expect(route).toMatch(/CONFIRMATION = "delete my account"/);
    expect(route).toMatch(/body\.confirm !== CONFIRMATION/);
    expect(route).toMatch(/status: 400/);
  });

  it("refuses to delete the last owner", () => {
    // No owner means no console and no way to make one from inside the app.
    const body = route.slice(route.indexOf("export async function DELETE"));
    expect(body).toMatch(/user\.role === "owner"/);
    expect(body).toMatch(/ne\(users\.id, user\.id\)/);
    expect(body).toMatch(/status: 409/);
  });

  it("records it before the row goes, then signs the device out", () => {
    const body = route.slice(route.indexOf("export async function DELETE"));
    expect(body.indexOf('audit("account.deleted"')).toBeLessThan(body.indexOf("db.delete(users)"));
    expect(body).toMatch(/maxAge: 0/);
  });

  it("removes everything, because everything cascades from the account", () => {
    // profiles hang off users with cascade, and every table of hers hangs off
    // profiles the same way — so one delete is the whole deletion. If a table
    // were ever added without cascade it would orphan rows the policy says
    // are gone.
    const schema = read("lib/db/schema.ts");
    const profileRefs = [...schema.matchAll(/references\(\(\) => profiles\.id[^)]*\)/g)];
    expect(profileRefs.length).toBeGreaterThan(15);
    for (const m of profileRefs) {
      expect(m[0], m[0]).toMatch(/onDelete: "cascade"/);
    }
    expect(schema).toMatch(/references\(\(\) => users\.id, \{ onDelete: "cascade" \}\)/);
  });

  it("is offered in the app with a typed confirmation, not a button", () => {
    const ui = read("components/delete-account.tsx");
    expect(ui).toMatch(/PHRASE = "delete my account"/);
    expect(ui).toMatch(/typed\.trim\(\)\.toLowerCase\(\) !== PHRASE/);
    expect(ui).toMatch(/role="alert"/);
    expect(read("app/settings/page.tsx")).toMatch(/<DeleteAccount \/>/);
  });
});
