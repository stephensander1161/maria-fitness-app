import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { countField, describeSet, formatCount } from "@/lib/holds";

const card = fs.readFileSync("components/train-client.tsx", "utf8");
const views = fs.readFileSync("lib/views.ts", "utf8");
const training = fs.readFileSync("lib/tools/training.ts", "utf8");

suite("a hold is seconds, on the screen as well as in the table", () => {
  it("asks for seconds, not reps", () => {
    // The card asked for "Reps" and "Weight" on a plank. is_hold and
    // hold_seconds had been right since holds were added; the screen was the
    // half that never got the message, which is the app not understanding the
    // movement — the exact complaint that got holds built.
    expect(countField(true).label).toBe("Seconds");
    expect(countField(false).label).toBe("Reps");
  });

  it("steps by fives, because nobody holds a plank for forty-one seconds", () => {
    expect(countField(true).step).toBe(5);
    expect(countField(true).decimals).toBe(false);
    // Reps keep the half she got part-way through.
    expect(countField(false).step).toBe(1);
    expect(countField(false).decimals).toBe(true);
  });

  it("writes a hold back as seconds", () => {
    expect(formatCount(45, true)).toBe("45s");
    expect(formatCount(8, false)).toBe("8");
    // A weighted plank is still a plank.
    expect(describeSet({ reps: 1, weight: null, holdSeconds: 45 }, true)).toBe("45s");
    expect(describeSet({ reps: 1, weight: 10, holdSeconds: 45 }, true)).toBe("45s@10");
    expect(describeSet({ reps: 8, weight: 30, holdSeconds: null }, false)).toBe("8@30");
  });

  it("never reads a hold's reps as its duration", () => {
    // log_set writes reps = 1 for a hold — one set is one hold — so anything
    // reading `reps` shows "1" for a 45-second plank. This is the bug.
    expect(describeSet({ reps: 1, weight: null, holdSeconds: 45 }, true)).not.toBe("1");
    // The view has to carry it, or nothing downstream can do better.
    expect(views).toMatch(/holdSeconds: setLogs\.holdSeconds/);
    expect(views).toMatch(/loggedToday: \{[^}]*holdSeconds: number \| null/);
    // And the card has to seed from it rather than from reps.
    expect(card).toMatch(/exercise\.isHold\s*\?\s*queued\.at\(-1\)\?\.reps \?\? done\.at\(-1\)\?\.holdSeconds/);
  });

  it("labels every set square through the one helper", () => {
    // Three places rendered "8@30" by hand and drifted; one of them is what
    // showed a plank as "1".
    expect(card).toMatch(/describeSet\(s, exercise\.isHold\)/);
    expect(card).not.toMatch(/\$\{s\.reps\}\$\{s\.weight !== null/);
  });
});

suite("correcting a hold", () => {
  it("takes seconds, and refuses reps", () => {
    // correct_set had no holdSeconds at all, so correcting a plank's duration
    // was impossible — it wrote to `reps`, which is precisely what log_set
    // refuses. Asking for eight of a wall sit is the app not understanding
    // the movement, in either direction.
    const fn = training.slice(training.indexOf('name: "correct_set"'));
    expect(fn.slice(0, 4000)).toMatch(/holdSeconds: z\.number\(\)\.optional\(\)/);
    expect(fn.slice(0, 4000)).toMatch(/is held, not counted/);
    expect(fn.slice(0, 4000)).toMatch(/is counted in reps, not seconds/);
    // A refusal has to be unmistakable — see the write-deadline wording.
    expect(fn.slice(0, 4000)).toMatch(/Nothing was changed\./);
  });

  it("sends seconds from the editor", () => {
    expect(card).toMatch(/\.\.\.\(isHold \? \{ holdSeconds: reps \} : \{ reps \}\)/);
  });
});
