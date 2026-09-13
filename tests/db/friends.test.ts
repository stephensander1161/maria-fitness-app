import { afterAll, beforeAll, describe as suite, expect, it } from "vitest";
import { runTool } from "@/lib/tools";
import { canSeeTraining, edgeById, trainingFor } from "@/lib/friends";
import { makeAccount, dropAccount, type TestAccount } from "./account";

/**
 * Two accounts, and what one may see of the other.
 *
 * The rule is absolute and the type is the control: **training crosses, a
 * body never does.** No weight, no measurements, no photos, no food, no
 * cycle, no injury, nothing from the conversation. And **asking is not
 * seeing** — a pending request has to reveal nothing at all, or the request
 * itself becomes the leak.
 *
 * `tests/friends.test.ts` holds the shape of `FriendTraining` and the module's
 * imports. This holds the behaviour, which needs two real accounts.
 */
let ann: TestAccount;
let ben: TestAccount;

beforeAll(async () => {
  ann = await makeAccount("friends-ann", { name: "Ann", startWeightKg: 71 });
  ben = await makeAccount("friends-ben", { name: "Ben", startWeightKg: 88 });
  // Ben trains and eats, so there is something to leak.
  await runTool("log_set", { exerciseSlug: "barbell-back-squat", reps: 5, weight: 100 }, ben.ctx);
  await runTool("log_weight", { weight: 88.4 }, ben.ctx);
  await runTool("log_measurement", { measurements: [{ site: "waist", value: 91 }] }, ben.ctx);
  await runTool("log_meal", { slot: "lunch", description: "ben-lunch-marker", calories: 700 }, ben.ctx);
});
afterAll(async () => {
  for (const s of strangers) await dropAccount(s);
  await dropAccount(ann);
  await dropAccount(ben);
});

const as = (who: TestAccount) =>
  <T = Record<string, unknown>>(name: string, input: Record<string, unknown> = {}) =>
    runTool(name, input, who.ctx) as Promise<T>;

let friendshipId = "";

/**
 * The gate, exactly as the screens and tools apply it: fetch the edge the
 * viewer is a party to, then ask whether it is accepted. Both halves matter —
 * `trainingFor` takes a profile id and trusts the caller to have checked.
 */
async function maySee(viewer: TestAccount, id: string): Promise<boolean> {
  return canSeeTraining(await edgeById(id, viewer.profileId), viewer.profileId);
}

suite("found by code, never by email", () => {
  it("mints a code and says what it does and does not grant", async () => {
    const out = await as(ben)<{ code: string; shareWith: string }>("get_share_code", {});
    expect(out.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(out.shareWith).toMatch(/still need you to say yes/i);
  });

  it("gives the same answer for an unknown code as for her own", async () => {
    // Or the field is an oracle: sweep it and you learn which codes exist.
    const mine = await as(ben)<{ code: string }>("get_share_code", {});
    const own = await as(ben)<{ ok?: boolean; error?: string }>("add_friend", { code: mine.code });
    const nobody = await as(ben)<{ ok?: boolean; error?: string }>("add_friend", { code: "ZZZZ-ZZZZ" });
    expect(own.ok ?? false).toBe(false);
    expect(nobody.ok ?? false).toBe(false);
    expect(own.error).toBe(nobody.error);
  });

  it("rotates on request, and the old one stops working", async () => {
    const before = (await as(ben)<{ code: string }>("get_share_code", {})).code;
    const after = await as(ben)<{ ok: boolean; code: string; note: string }>("reset_share_code", {});
    expect(after.code).not.toBe(before);
    expect(after.note).toMatch(/no longer works/i);
    const stale = await as(ann)<{ ok?: boolean }>("add_friend", { code: before });
    expect(stale.ok ?? false).toBe(false);
  });
});

suite("asking is not seeing", () => {
  it("reveals nothing at all while the request is pending", async () => {
    const code = (await as(ben)<{ code: string }>("get_share_code", {})).code;
    const asked = await as(ann)<{ ok: boolean; state: string; friendshipId: string }>("add_friend", { code });
    expect(asked.state).toBe("you-asked");
    friendshipId = asked.friendshipId;

    expect(await maySee(ann, friendshipId)).toBe(false);
    const stats = await as(ann)<{ friends: unknown[] }>("get_friend_stats", {});
    expect(stats.friends).toHaveLength(0);
  });

  it("refuses to let the asker accept their own request", async () => {
    const out = await as(ann)<{ ok?: boolean }>("respond_to_friend_request", {
      friendshipId, accept: true,
    });
    expect(out.ok ?? false).toBe(false);
    expect(await maySee(ann, friendshipId)).toBe(false);
  });

  it("opens both ways the moment the other one says yes", async () => {
    // Symmetric by construction: there is no one-way follow, because "he sees
    // my sessions and I cannot see his" invites comparison without consent.
    const yes = await as(ben)<{ ok: boolean }>("respond_to_friend_request", {
      friendshipId, accept: true,
    });
    expect(yes.ok).toBe(true);
    expect(await maySee(ann, friendshipId)).toBe(true);
    expect(await maySee(ben, friendshipId)).toBe(true);
  });
});

suite("training crosses, a body never does", () => {
  it("hands over his sessions and his lifts", async () => {
    const his = await trainingFor(ben.profileId, "metric");
    expect(his.name).toBe("Ben");
    expect(his.setsAllTime).toBeGreaterThan(0);
    expect(his.bestEver.length).toBeGreaterThan(0);
  });

  it("carries no weight, no measurement, no meal and no marker of either", async () => {
    const his = JSON.stringify(await trainingFor(ben.profileId, "metric"));
    // The numbers he logged that are not training.
    expect(his).not.toMatch(/88\.4/);
    expect(his).not.toMatch(/\b91\b/);
    expect(his).not.toMatch(/ben-lunch-marker/);
    /*
      And no field that could ever hold one.

      `weight` on its own is not on the list, and deliberately: a lift has a
      weight and it is the whole point of `bestEver`. What must never appear
      is a *body* weight, which is why the readings above are checked as
      numbers and the words below are the ones that only ever describe her.
    */
    for (const word of [
      "bodyweight", "weighIn", "weigh_in", "measurement", "waist", "hips", "neck",
      "photo", "calorie", "protein", "meal", "food", "pantry",
      "cycle", "period", "injury", "complaint", "sleep", "conversation", "message",
    ]) {
      expect(his.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  it("reads his lifts in the reader's units, not his", async () => {
    const metric = await trainingFor(ben.profileId, "metric");
    const imperial = await trainingFor(ben.profileId, "imperial");
    expect(imperial.bestEver[0].weight!).toBeGreaterThan(metric.bestEver[0].weight!);
  });

  it("hands a stranger no edge to check at all", async () => {
    // There is nothing to ask about, which is the strongest form of no: an
    // id she is not a party to does not come back, so the check above cannot
    // even be reached with somebody else's friendship.
    expect(await edgeById(friendshipId, (await makeStranger()).profileId)).toBeNull();
  });
});

async function makeStranger() {
  const cat = await makeAccount("friends-cat", { name: "Cat" });
  strangers.push(cat);
  return cat;
}
const strangers: TestAccount[] = [];

suite("a high five", () => {
  it("goes to a friend and is counted once on the other side", async () => {
    const sent = await as(ann)<{ ok: boolean }>("send_high_five", { friendshipId });
    expect(sent.ok).toBe(true);
    const got = await as(ben)<{ ok: boolean; new: number }>("get_high_fives", {});
    expect(got.new).toBeGreaterThan(0);
    await as(ben)("acknowledge_high_fives", {});
    expect((await as(ben)<{ new: number }>("get_high_fives", {})).new).toBe(0);
  });
});

suite("ending it", () => {
  it("closes the window in both directions", async () => {
    const out = await as(ann)<{ ok: boolean }>("remove_friend", { friendshipId });
    expect(out.ok).toBe(true);
    expect(await maySee(ann, friendshipId)).toBe(false);
    expect(await maySee(ben, friendshipId)).toBe(false);
  });

  it("refuses an id that is not one", async () => {
    const out = await as(ann)<{ ok?: boolean }>("remove_friend", { friendshipId: "bens-one" });
    expect(out.ok ?? false).toBe(false);
  });
});
