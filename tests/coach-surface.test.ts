import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { coachSurfaceFor } from "@/lib/coach-surface";

suite("which screen the coach is being asked about", () => {
  it("names every screen that had its own pair of buttons", () => {
    // These are the seven headers the pair was copied into. Moving them into
    // the companion must not quietly drop one.
    expect(coachSurfaceFor("/train")?.label).toBe("session");
    expect(coachSurfaceFor("/plan")?.label).toBe("plan");
    expect(coachSurfaceFor("/progress")?.label).toBe("progress");
    expect(coachSurfaceFor("/eat")?.label).toBe("food");
    expect(coachSurfaceFor("/kitchen")?.label).toBe("the kitchen");
    expect(coachSurfaceFor("/learn")?.label).toBe("the library");
    expect(coachSurfaceFor("/settings")?.label).toBe("your setup");
  });

  it("keeps the page each one asks the server about", () => {
    // `page` is what contextForPath() understands, and it is not always the
    // path: Eat and Kitchen are both the planner's context.
    expect(coachSurfaceFor("/eat")?.page).toBe("plan");
    expect(coachSurfaceFor("/kitchen")?.page).toBe("plan");
    expect(coachSurfaceFor("/learn")?.page).toBe("train");
    expect(coachSurfaceFor("/settings")?.page).toBe("progress");
  });

  it("matches a screen's sub-paths too", () => {
    expect(coachSurfaceFor("/train/goblet-squat")?.page).toBe("train");
    expect(coachSurfaceFor("/progress/photos")?.page).toBe("progress");
  });

  it("offers nothing where there is nothing to read", () => {
    // Tapping the figure still opens the coach; there is just no opinion on
    // offer about a screen the server has no context for.
    expect(coachSurfaceFor("/friends")).toBeNull();
    expect(coachSurfaceFor("/admin")).toBeNull();
    expect(coachSurfaceFor("/login")).toBeNull();
  });

  it("is the only place the pair is mounted", () => {
    // Two coach entry points on one page is one too many, and seven copies of
    // the pair is seven headers to keep tidy.
    const uses = ["app", "components"].flatMap((dir) => walk(dir))
      .filter((f) => /\.tsx$/.test(f) && f !== "components/ai-opinion.tsx")
      .filter((f) => /<AiOpinion/.test(fs.readFileSync(f, "utf8")));
    expect(uses).toEqual(["components/companion.tsx"]);
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
