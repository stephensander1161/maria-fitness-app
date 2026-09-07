import { describe as suite, expect, it } from "vitest";
import { LATEST_ID, unseen, WHATS_NEW, type WhatsNew } from "@/lib/whats-new";
import { registry } from "@/lib/tools";

const E: WhatsNew[] = [
  { id: "c", date: "2026-09-06", title: "C", blurb: "" },
  { id: "b", date: "2026-09-05", title: "B", blurb: "", audience: "recovering" },
  { id: "a", date: "2026-09-04", title: "A", blurb: "" },
];
const old = { createdAt: new Date("2026-08-01T00:00:00Z"), recovering: false, owner: false };

suite("what's new, once per person", () => {
  it("shows everything to someone who has seen nothing", () => {
    expect(unseen(null, old, E).map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("shows only what is newer than the last thing dismissed", () => {
    expect(unseen("a", old, E).map((e) => e.id)).toEqual(["c"]);
    expect(unseen("c", old, E)).toEqual([]);
  });

  it("shows nothing to an account created after the entry", () => {
    // It was never "new" to them, and a welcome screen is not a changelog.
    const fresh = { ...old, createdAt: new Date("2026-09-06T12:00:00Z") };
    expect(unseen(null, fresh, E)).toEqual([]);
  });

  it("keeps an audience-limited entry from everyone else", () => {
    expect(unseen(null, { ...old, recovering: true }, E).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("shows nothing rather than everything when the seen id is unknown", () => {
    // An entry got removed. Re-showing the whole list to everyone would be
    // the loud failure; showing nothing is the quiet one.
    expect(unseen("zzz", old, E)).toEqual([]);
  });

  it("is a list whose ids never collide and stays newest first", () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < WHATS_NEW.length; i++) {
      expect(WHATS_NEW[i - 1].date >= WHATS_NEW[i].date, `${ids[i - 1]} before ${ids[i]}`).toBe(true);
    }
    expect(LATEST_ID).toBe(ids[0]);
  });

  it("ships its tools", () => {
    expect(registry.has("list_whats_new")).toBe(true);
    expect(registry.has("dismiss_whats_new")).toBe(true);
  });
});
