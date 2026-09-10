import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { sessionHappened } from "@/lib/week-done";

const read = (p: string) => fs.readFileSync(p, "utf8");

suite("one rule for whether a session happened", () => {
  it("the pure rule counts the work, not the button", () => {
    // Twenty sets and no Finish pressed is a session. A button is a record of
    // how long it took; it is not what decides that it took place.
    expect(sessionHappened({ planDayId: null, title: "", dayOfWeek: 0, sets: 20, completed: false })).toBe(true);
    expect(sessionHappened({ planDayId: null, title: "", dayOfWeek: 0, sets: 0, completed: true })).toBe(true);
    expect(sessionHappened({ planDayId: null, title: "", dayOfWeek: 0, sets: 0, completed: false })).toBe(false);
  });

  it("and every database count uses the same one", () => {
    // The rule was applied in one place and not the others, so one Progress
    // screen said "3 of 6 sessions" and "2 day streak" about the same three
    // days: Monday had twenty sets and no Finish, so it counted for the week
    // and not for the streak. Two counters disagreeing about one week is
    // worse than either being wrong alone.
    const sessions = read("lib/sessions.ts");
    expect(sessions).toMatch(/completedAt\} is not null/);
    expect(sessions).toMatch(/or exists \(select 1 from/);

    for (const f of ["lib/progress.ts", "lib/views.ts", "lib/friends.ts"]) {
      const src = read(f);
      expect(src, `${f} does not use the shared predicate`).toMatch(/workoutHappened/);
      // …and none of them still counts finished-only sessions by hand.
      expect(src, `${f} still counts only finished sessions`)
        .not.toMatch(/isNotNull\(workouts\.completedAt\)/);
      expect(src, `${f} still counts only finished sessions`)
        .not.toMatch(/sql`\$\{workouts\.completedAt\} is not null`/);
    }
  });

  it("the owner's console is left alone, because it counts something else", () => {
    // /admin reports whether an account has *finished* anything — an
    // operational question about use of the app, not a claim to her about her
    // training. It is the one place the button is the right measure.
    expect(read("lib/admin.ts")).toMatch(/isNotNull\(workouts\.completedAt\)/);
  });
});
