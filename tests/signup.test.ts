import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { claimable, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, parseSignup } from "@/lib/signup";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * Sign-up is claiming an invitation, never creating one.
 *
 * The allowlist is the users table, and this page must not be a way onto it.
 * The decision about who may claim what is pure and tested here; the route's
 * job is to apply it and to apply it atomically.
 */
const fresh = { passwordHash: null, googleSub: null, lastLoginAt: null, disabledAt: null };
const LONG_ENOUGH = "x".repeat(MIN_PASSWORD_LENGTH);

suite("who may claim an account", () => {
  it("only an invitation nobody has used", () => {
    expect(claimable(fresh)).toBeNull();
  });

  it("refuses an address that was never invited", () => {
    // The form is open to anyone; the list is not.
    expect(claimable(null)).toBe("not_invited");
  });

  it("refuses an account that already has a password", () => {
    // Otherwise sign-up is a password reset for anyone who knows the address.
    expect(claimable({ ...fresh, passwordHash: "scrypt$..." })).toBe("already_claimed");
  });

  it("refuses an account that has signed in with Google", () => {
    // A Google-only account has no password. Without this, anyone who knew
    // its address could set one and walk in beside its owner.
    expect(claimable({ ...fresh, googleSub: "1234567890" })).toBe("already_claimed");
  });

  it("refuses an account that has ever signed in", () => {
    expect(claimable({ ...fresh, lastLoginAt: new Date("2026-09-01T09:04:00Z") })).toBe("already_claimed");
  });

  it("refuses a disabled account, even an unused one", () => {
    expect(claimable({ ...fresh, disabledAt: new Date() })).toBe("disabled");
  });
});

suite("what the form may send", () => {
  it("normalises the address the way the invite did", () => {
    const parsed = parseSignup({ email: "  Sander@Example.COM ", password: LONG_ENOUGH });
    expect(parsed.ok && parsed.input.email).toBe("sander@example.com");
  });

  it("rejects something that is not an address", () => {
    for (const email of ["", "nope", "@example.com", "sander@", "two words@example.com"]) {
      const parsed = parseSignup({ email, password: LONG_ENOUGH });
      expect(parsed.ok, email).toBe(false);
      expect(!parsed.ok && parsed.reason).toBe("invalid_email");
    }
  });

  it("holds the same length floor as the command line", () => {
    // scripts/users.ts refuses under twelve; the page must not be the way
    // around that.
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    const short = parseSignup({ email: "a@b.c", password: "x".repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(!short.ok && short.reason).toBe("too_short");
    expect(parseSignup({ email: "a@b.c", password: LONG_ENOUGH }).ok).toBe(true);
    const long = parseSignup({ email: "a@b.c", password: "x".repeat(MAX_PASSWORD_LENGTH + 1) });
    expect(!long.ok && long.reason).toBe("too_long");
  });

  it("does not trim the password", () => {
    // Trimming here and not at sign-in would lock her out with the password
    // she chose.
    const parsed = parseSignup({ email: "a@b.c", password: ` ${LONG_ENOUGH} ` });
    expect(parsed.ok && parsed.input.password).toBe(` ${LONG_ENOUGH} `);
  });

  it("treats a blank name as no name", () => {
    const parsed = parseSignup({ email: "a@b.c", password: LONG_ENOUGH, name: "   " });
    expect(parsed.ok && parsed.input.name).toBeNull();
    const named = parseSignup({ email: "a@b.c", password: LONG_ENOUGH, name: " Maria " });
    expect(named.ok && named.input.name).toBe("Maria");
  });

  it("survives a body that is not an object", () => {
    for (const body of [null, undefined, 42, "email=x", []]) {
      expect(parseSignup(body).ok).toBe(false);
    }
  });
});

suite("the route applies the decision, and nothing looser", () => {
  const route = read("app/api/auth/signup/route.ts");

  it("never inserts an account", () => {
    // This is the whole point. A sign-up page that can insert a users row is
    // open registration with extra steps.
    expect(route).not.toMatch(/\.insert\(/);
    expect(route).toMatch(/claimable\(/);
  });

  it("stores a hash, never the password", () => {
    expect(route).toMatch(/passwordHash:\s*await hashPassword\(password\)/);
    expect(route).not.toMatch(/passwordHash:\s*password\b/);
  });

  it("claims atomically, so two sign-ups for one address cannot both land", () => {
    // The check in claimable() cannot see a concurrent request. The update
    // has to restate the same conditions in the query itself and treat an
    // empty result as a refusal.
    const update = route.slice(route.indexOf("db.update(users)"), route.indexOf(".returning("));
    expect(update).toMatch(/isNull\(users\.passwordHash\)/);
    expect(update).toMatch(/isNull\(users\.googleSub\)/);
    expect(update).toMatch(/isNull\(users\.lastLoginAt\)/);
    expect(route).toMatch(/claimed\.length === 0/);
  });

  it("is a door, so it has the same lock as sign-in", () => {
    expect(route).toMatch(/checkLoginAllowed\(ip, email\)/);
    expect(route).toMatch(/audit\("signup\.(success|failure)"/);
  });

  it("gives every refusal the same answer", () => {
    // Uninvited, claimed, disabled: one message, so the form cannot be used to
    // read the list.
    const bodies = [...route.matchAll(/Response\.json\(\{ error: (\w+) \}, \{ status: 403 \}\)/g)].map((m) => m[1]);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(new Set(bodies)).toEqual(new Set(["REFUSED"]));
  });

  it("sets the cookie through the store, not on a redirect", () => {
    // Response.redirect() has immutable headers — the Google callback once
    // linked an account and then died before issuing a session.
    expect(route).toMatch(/store\.set\(SESSION_COOKIE/);
    // Checked against the code, not the comment that explains it.
    const code = route.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/Response\.redirect/);
  });
});

suite("the screen is reachable and chromeless", () => {
  it("is public, both the page and its door", () => {
    const mw = read("middleware.ts");
    expect(mw).toMatch(/"\/signup",/);
    expect(mw).toMatch(/"\/api\/auth\/signup",/);
  });

  it("shows no app chrome to someone who is not signed in", () => {
    for (const f of ["components/side-nav.tsx", "components/tab-bar.tsx", "components/coach-bubble.tsx", "components/feedback.tsx"]) {
      expect(read(f), f).toMatch(/"\/signup"/);
    }
  });

  it("is linked from the sign-in screen, and back", () => {
    expect(read("app/login/page.tsx")).toMatch(/href="\/signup"/);
    expect(read("app/signup/page.tsx")).toMatch(/href="\/login"/);
  });
});
