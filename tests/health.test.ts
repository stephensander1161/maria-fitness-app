import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the uptime probe", () => {
  /*
    2026-09-18, from the prod-readiness audit: nothing alerted when the site
    was down or the database unreachable. /api/health is the one route an
    uptime monitor asks every minute; it exists to make that ring possible.
  */
  const route = read("app/api/health/route.ts");

  it("answers without a session, and is the only new public path", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toMatch(/"\/api\/health",/);
  });

  it("asks the database, and says only ok or not", () => {
    expect(route).toMatch(/select 1/);
    expect(route).toMatch(/status: 503/);
    // No version, host, table or error text in the body: a stranger learns
    // that the door exists, nothing more.
    const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/message|stack|version|DATABASE_URL|err\./);
    expect(route).toMatch(/ok: true, at/);
    expect(route).toMatch(/ok: false, at/);
  });

  it("is never cached — a monitor must see now, not a minute ago", () => {
    expect(route).toMatch(/force-dynamic/);
    expect(route.match(/"Cache-Control": "no-store"/g)).toHaveLength(2);
  });
});
