import { describe as suite, expect, it } from "vitest";
import { identityFrom, statesMatch } from "@/lib/oauth";

/**
 * Sign-in with Google reduces to one question: has Google verified that this
 * person controls that email address? Everything downstream — the session, the
 * invite check, the audit trail — assumes the answer is yes.
 *
 * The signature is not re-verified because the token came over TLS from
 * Google's own endpoint, authenticated with our client secret. That makes the
 * *claim* checks the whole of the security here, and they had no test.
 */
const CLIENT = "1234.apps.googleusercontent.com";

const token = (claims: Record<string, unknown>) => {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${body}.signature`;
};
const valid = {
  sub: "108", email: "Her@Example.com ", email_verified: true,
  name: "Her", aud: CLIENT, iss: "https://accounts.google.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

suite("accepting an identity from Google", () => {
  it("takes a well-formed, verified token", () => {
    expect(identityFrom(token(valid), CLIENT)).toEqual({
      sub: "108", email: "her@example.com", name: "Her",
    });
  });

  it("accepts either form of the issuer Google actually sends", () => {
    expect(identityFrom(token({ ...valid, iss: "accounts.google.com" }), CLIENT).sub).toBe("108");
  });

  it("accepts email_verified as the string Google sometimes sends", () => {
    expect(identityFrom(token({ ...valid, email_verified: "true" }), CLIENT).sub).toBe("108");
  });
});

suite("refusing one", () => {
  it("refuses an unverified email — the whole attack", () => {
    // Anyone can put an address they do not own into an unverified profile.
    for (const value of [false, "false", undefined, null, 1, "TRUE"]) {
      expect(() => identityFrom(token({ ...valid, email_verified: value }), CLIENT))
        .toThrow(/verified/);
    }
  });

  it("refuses a token minted for a different app", () => {
    expect(() => identityFrom(token({ ...valid, aud: "someone-else.apps.googleusercontent.com" }), CLIENT))
      .toThrow(/audience/);
  });

  it("refuses an issuer that is not Google", () => {
    for (const iss of ["https://accounts.google.com.evil.test", "evil.test", ""]) {
      expect(() => identityFrom(token({ ...valid, iss }), CLIENT)).toThrow(/issuer/);
    }
  });

  it("refuses an expired token", () => {
    expect(() => identityFrom(token({ ...valid, exp: Math.floor(Date.now() / 1000) - 1 }), CLIENT))
      .toThrow(/expired/);
  });

  it("refuses a token with no subject or no email", () => {
    expect(() => identityFrom(token({ ...valid, sub: undefined }), CLIENT)).toThrow(/subject or email/);
    expect(() => identityFrom(token({ ...valid, email: undefined }), CLIENT)).toThrow(/subject or email/);
  });

  it("refuses when there is no client id to check against", () => {
    // Otherwise a missing env var would silently disable the audience check.
    expect(() => identityFrom(token(valid), undefined)).toThrow(/client id/);
    expect(() => identityFrom(token(valid), "")).toThrow(/client id/);
  });

  it("refuses a payload that is not readable at all", () => {
    expect(() => identityFrom("not.a.token", CLIENT)).toThrow();
    expect(() => identityFrom("", CLIENT)).toThrow();
  });
});

suite("the state parameter", () => {
  it("matches only an exact pair", () => {
    expect(statesMatch("abc123", "abc123")).toBe(true);
    expect(statesMatch("abc123", "abc124")).toBe(false);
    expect(statesMatch("abc123", "abc1234")).toBe(false);
    expect(statesMatch("", "")).toBe(false);
  });
});
