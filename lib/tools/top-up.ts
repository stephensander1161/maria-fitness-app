import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { alertOwners } from "@/lib/owner-alert";
import { profiles } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { today } from "@/lib/date";
import { defineTool } from "./define";

/**
 * Asking for more when the day's allowance is gone.
 *
 * She can ask; only the owner can answer. That split is the whole design:
 * `profiles.top_up_micros` is the one thing in the app that lifts someone
 * above the deployment's ceiling, so granting it lives on the owner's command
 * line (`npm run user -- topup`), out of the model's reach, while *asking* is
 * a normal tool she can reach from the button that appears when the coach
 * stops. A prompt that could grant would be a prompt that could buy itself an
 * unlimited day.
 *
 * The alternative was a dead end that says "back tomorrow" — which for
 * someone mid-session, mid-question, is the app deciding on her behalf that
 * her evening is over.
 *
 * One ask a day. The console needs to know she is stuck, not how many times
 * she tapped it.
 */
export const requestTopUp = defineTool({
  name: "request_top_up",
  description:
    "Tell the owner she has run out of coach allowance for today and would like more. Call this when she asks for more after being told the budget is spent — it does not grant anything, it puts the ask on the owner's console. Asking twice in a day changes nothing, and say so plainly rather than implying it went further.",
  input: z.object({}),
  handler: async (_input, ctx) => {
    // The ledger's day, not hers: the budget it is about is counted that way
    // (one global window — see lib/limits.ts), and two different days here
    // would let one ask land against a spend that has already reset.
    const day = today();
    const [profile] = await db
      .select({ askedOn: profiles.topUpRequestedOn, grantedOn: profiles.topUpOn })
      .from(profiles).where(eq(profiles.id, ctx.profileId)).limit(1);
    if (!profile) return { ok: false, error: "No profile." };

    if (profile.grantedOn === day) {
      return { ok: true, alreadyGranted: true, message: "You have already been given more for today." };
    }
    if (profile.askedOn === day) {
      return { ok: true, alreadyAsked: true, message: "That is already with the owner — asking again does not move it along." };
    }

    await db.update(profiles).set({ topUpRequestedOn: day }).where(eq(profiles.id, ctx.profileId));
    await audit("topup.requested", { detail: { profileId: ctx.profileId, day } });

    /*
      Wake the owner.

      Until somebody answers, this person's coach is switched off — and the
      ask is the one message in this app that is somebody wanting to *spend*
      rather than complain. Discovering it on the console tomorrow is the same
      as not getting it.

      Best effort and never awaited into the answer she is waiting for: a push
      service having a bad minute must not turn "asked" into an error. The
      request is on the console either way, which is what it was before.
    */
    void alertOwners().catch(() => { /* see above */ });

    return { ok: true, message: "Asked. The owner sees it on the console and can add more for today." };
  },
});
