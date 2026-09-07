import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

/**
 * The sign-in door says one flat thing to every failure, except one. That
 * exception exists because the flat message locked a real invitee out — he
 * typed his correct address four ways and was told "that's not right" each
 * time — so it is tested as narrowly as it is written.
 */
suite("the one failure the door explains", () => {
  const route = read("app/api/login/route.ts");
  const branch = route.slice(route.indexOf("if (user && !user.disabledAt && !user.passwordHash)"),
                             route.indexOf("if (!ok || !user || user.disabledAt)"));

  it("only fires for an invited address with no password", () => {
    expect(branch.length).toBeGreaterThan(0);
    // Exists, is enabled, has no hash. All three, or it says nothing extra.
    expect(branch).toMatch(/user && !user\.disabledAt && !user\.passwordHash/);
    expect(branch).toMatch(/hint: "no_password"/);
  });

  it("leaves every other failure identical", () => {
    const rest = route.slice(route.indexOf("if (!ok || !user || user.disabledAt)"));
    expect(rest).toMatch(/error: "That's not right\."/);
    // A disabled account with no password must not be told it is invited.
    expect(branch).toMatch(/!user\.disabledAt/);
  });

  it("still records nothing typed as a password", () => {
    expect(branch).not.toMatch(/\bpassword\b\s*[,}]/);
  });

  it("is explained on the form with the two ways in", () => {
    const form = read("components/login-form.tsx");
    expect(form).toMatch(/data\.hint === "no_password"/);
    expect(form).toMatch(/href="\/signup"/);
    expect(form).toMatch(/Continue with Google above/);
  });

  it("is written down as the exception it is", () => {
    expect(read("SECURITY.md")).toMatch(/one deliberate exception/i);
    expect(read("COMPLIANCE.md")).toMatch(/One stated exception/);
  });
});
