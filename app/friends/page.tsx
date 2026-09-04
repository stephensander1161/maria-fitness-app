import { requireOnboarded } from "@/lib/session";
import { runTool } from "@/lib/tools";
import { AskCoach } from "@/components/ask-coach";
import { FriendsClient } from "@/components/friends-client";
import type { FriendTraining } from "@/lib/friends";

export const dynamic = "force-dynamic";

export type FriendCard = FriendTraining & { friendshipId: string };
type Edge = { friendshipId: string; name: string; state: string };

/**
 * Training, shared with people she knows.
 *
 * Deliberately its own screen rather than a section of Progress: Progress is
 * about her, and the moment someone else's numbers sit inside it, every glance
 * at her own week carries a comparison she did not ask for.
 *
 * What crosses is training and only training — see lib/friends.ts.
 */
export default async function FriendsPage() {
  const profile = await requireOnboarded();
  const ctx = { profileId: profile.id };

  const [code, list, stats] = await Promise.all([
    runTool("get_share_code", {}, ctx) as Promise<{ code: string }>,
    runTool("list_friends", {}, ctx) as Promise<{
      friends: Edge[]; waitingOnYou: Edge[]; waitingOnThem: Edge[];
    }>,
    runTool("get_friend_stats", {}, ctx) as Promise<{ friends?: FriendCard[] }>,
  ]);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Share how training is going with people you know.
        </p>
      </header>

      <div className="max-w-xl lg:max-w-5xl">
        <FriendsClient
          myCode={code.code}
          friends={stats.friends ?? []}
          waitingOnYou={list.waitingOnYou}
          waitingOnThem={list.waitingOnThem}
        />

        <div className="mt-6">
          <AskCoach
            title="Ask about your friends"
            hint="Your coach can compare weeks, or add someone by their code."
            suggestions={[
              "How is everyone training this week?",
              "Who has the longest streak?",
              "What's my friend code?",
            ]}
            placeholder="Ask about training together…"
          />
        </div>
      </div>
    </>
  );
}
