import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { backTo, LIBRARY, movementHref } from "@/lib/back-to";

suite("back goes where she came from", () => {
  it("returns her to the day, not the library", () => {
    // Tapping a warm-up on the Train screen and landing in the library is the
    // app losing her place. It was hardcoded to /learn because that used to be
    // the only way in.
    expect(backTo("/train?d=2026-09-11")).toEqual({ href: "/train?d=2026-09-11", label: "Today" });
    expect(backTo("/plan")).toEqual({ href: "/plan", label: "Plan" });
    expect(backTo("/recovery")).toEqual({ href: "/recovery", label: "Recovery" });
  });

  it("falls back to the library when it has nothing to go on", () => {
    for (const nothing of [undefined, null, "", "/", "/nowhere", "learn"]) {
      expect(backTo(nothing as string | undefined), String(nothing)).toEqual(LIBRARY);
    }
  });
});

suite("a redirect target out of a query string is never trusted", () => {
  /*
    No user data travels in `from` and nothing is written from it — the whole
    job is a label and an href. But a link target read out of the URL is
    exactly the shape that becomes a phishing link the moment somebody stops
    checking it, so it is checked.
  */
  it("never leaves the site", () => {
    for (const away of [
      "//evil.example",
      "//evil.example/train",
      "https://evil.example",
      "http://evil.example/train",
      "javascript:alert(1)",
      "/\\evil.example",
      "\\\\evil.example",
      " //evil.example",
    ]) {
      expect(backTo(away), away).toEqual(LIBRARY);
    }
  });

  it("takes only screens this app actually has", () => {
    // An allowlist, not a pattern, so a new route is a deliberate addition.
    expect(backTo("/admin")).toEqual(LIBRARY);
    expect(backTo("/api/chat")).toEqual(LIBRARY);
    expect(backTo("/login")).toEqual(LIBRARY);
  });

  it("rebuilds the path rather than echoing it back", () => {
    // Only the first segment and a plain query survive; a deeper path is not
    // carried through, so "/train/../../x" cannot be reassembled.
    expect(backTo("/train/barbell-bench-press").href).toBe("/train");
    expect(backTo("/train/../admin").href).toBe("/train");
    // A fragment or a backslash is refused outright rather than stripped.
    expect(backTo("/train#x")).toEqual(LIBRARY);
    // And a query it does not recognise is dropped, not passed on.
    expect(backTo("/train?d=<script>").href).toBe("/train");
  });

  it("refuses an absurdly long one", () => {
    expect(backTo(`/train?d=${"a".repeat(500)}`)).toEqual(LIBRARY);
  });

  it("escapes what it puts in the link", () => {
    expect(movementHref("plank", "/train?d=2026-09-11"))
      .toBe("/learn/plank?from=%2Ftrain%3Fd%3D2026-09-11");
  });
});

suite("every way into a movement's page carries it", () => {
  it("the day's stretches, the plan, and recovery", () => {
    // One that forgets sends her to the library instead of back to where she
    // was, which is the bug this exists to fix.
    for (const file of [
      "components/stretch-block.tsx",
      "components/planned-exercise-row.tsx",
      "app/recovery/page.tsx",
    ]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} links to a movement without saying where back is`)
        .not.toMatch(/href=\{`\/learn\/\$\{[^}]+\}`\}/);
      expect(src, `${file} does not use movementHref`).toMatch(/movementHref\(/);
    }
  });

  it("and the page honours it", () => {
    const page = fs.readFileSync("app/learn/[slug]/page.tsx", "utf8");
    expect(page).toMatch(/backTo\(\(await searchParams\)\.from\)/);
    expect(page).not.toMatch(/href="\/learn"/);
  });
});
