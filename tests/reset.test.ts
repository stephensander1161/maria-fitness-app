import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { INVITE_TTL_MS, linkFor, newToken, parseToken, refusal, RESET_TTL_MS, tokenHash, ttlFor } from "@/lib/reset";
import { linkMail } from "@/lib/email";
const read = (p: string) => fs.readFileSync(p, "utf8");

suite("the emailed door — 2026-09-18", () => {
  /*
    "The first client who forgets a password is a support ticket." Until now
    an owner ran `npm run user -- passwd` and read a password out over the
    phone. This is the self-service version, built the way the rest of the
    door is built: a random token in the link, only its hash at rest, one
    use, an hour.
  */
  it("a token is long, random, and stored only as a hash", () => {
    const a = newToken(); const b = newToken();
    expect(a).not.toBe(b);
    expect(parseToken(a)).toBe(a);
    expect(tokenHash(a)).toHaveLength(64);
    expect(tokenHash(a)).not.toContain(a.slice(0, 8));
    // Only the shape from the URL; anything else is nothing.
    expect(parseToken("short")).toBeNull();
    expect(parseToken(`${a}<script>`)).toBeNull();
    expect(parseToken(42)).toBeNull();
  });

  it("is good once, for an hour — a week for an invitation", () => {
    expect(ttlFor("reset")).toBe(RESET_TTL_MS);
    expect(ttlFor("invite")).toBe(INVITE_TTL_MS);
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
    const now = new Date("2026-09-18T12:00:00Z");
    const live = { kind: "reset" as const, expiresAt: new Date("2026-09-18T12:30:00Z"), usedAt: null };
    expect(refusal(live, "reset", now)).toBeNull();
    expect(refusal({ ...live, usedAt: now }, "reset", now)).toBe("used");
    expect(refusal({ ...live, expiresAt: now }, "reset", now)).toBe("expired");
    expect(refusal(live, "invite", now)).toBe("wrong_kind");
    expect(refusal(null, "reset", now)).toBe("unknown");
  });

  it("links to the deployment's own origin, never the request's host", () => {
    expect(linkFor("reset", "tok", "https://sorewinner.app/")).toBe("https://sorewinner.app/reset?token=tok");
    expect(linkFor("invite", "tok", "https://dev.sorewinner.app")).toBe("https://dev.sorewinner.app/signup?token=tok");
    const route = read("app/api/auth/reset/route.ts");
    expect(route).toMatch(/env\.APP_URL \?\? new URL\(req\.url\)\.origin/);
  });

  it("asking answers the same whether or not the address exists, and is rate limited", () => {
    const route = read("app/api/auth/reset/route.ts");
    expect(route.match(/return Response\.json\(SAME\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toMatch(/checkResetAllowed\(clientIp\(req\), email\)/);
    // The newest link is the one that works.
    expect(route).toMatch(/set\(\{ usedAt: new Date\(\) \}\)/);
    // An invitation never claimed gets an invitation, not a reset.
    expect(route).toMatch(/user\.passwordHash \|\| user\.googleSub \|\| user\.lastLoginAt \? "reset" : "invite"/);
  });

  it("using it sets the password, signs every other device out, and signs this one in", () => {
    const confirm = read("app/api/auth/reset/confirm/route.ts");
    expect(confirm).toMatch(/refusal\(row \?\? null, "reset"\)/);
    expect(confirm).toMatch(/usedAt: now/);
    expect(confirm).toMatch(/sessionsValidFrom: now/);
    expect(confirm).toMatch(/hashPassword\(password\)/);
    expect(confirm).toMatch(/store\.set\(SESSION_COOKIE/);
    expect(confirm).toMatch(/MIN_PASSWORD_LENGTH/);
  });

  it("the mail is plain text first, and the HTML only makes the link tappable", () => {
    const m = linkMail("a@b.c", "Subject", ["Line <one>"], "https://x/reset?token=t", "Go");
    expect(m.text).toContain("https://x/reset?token=t");
    expect(m.text).toContain("Line <one>");
    expect(m.html).toContain("Line &lt;one&gt;");
    expect(m.html).toContain('href="https://x/reset?token=t"');
    expect(m.text).toMatch(/If you didn't ask for this/);
  });

  it("is reachable without a session, and the invite command sends one", () => {
    const proxy = read("proxy.ts");
    for (const p of ["/forgot", "/reset", "/api/auth/reset", "/api/auth/reset/confirm"]) expect(proxy).toContain(`"${p}",`);
    expect(read("components/login-form.tsx")).toMatch(/href="\/forgot"/);
    const users = read("scripts/users.ts");
    expect(users).toMatch(/kind: "invite"/);
    expect(users).toMatch(/sendEmail\(linkMail\(/);
    // Nothing about a message body is audited, and the token never is.
    const email = read("lib/email.ts");
    expect(email).not.toMatch(/audit\([^)]*(text|html|subject|token)/);
  });
});
