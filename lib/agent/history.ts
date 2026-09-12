import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";

/** At least this many messages are replayed… */
const WINDOW = 40;
/** …and the window's start only moves this many at a time. */
const STEP = 20;

/**
 * Rows are stored as Anthropic content-block arrays, so replay is verbatim —
 * tool_use and tool_result blocks survive a page reload intact.
 *
 * The window is anchored, not sliding. Prompt caching matches on an exact
 * prefix, and a "last 40 rows" window drops its oldest row every turn — so
 * once a conversation passed 40 rows, the cached history missed on every
 * single turn. Starting at a multiple of STEP instead means the prefix is
 * identical for STEP turns in a row and shifts once, and the window is
 * between WINDOW and WINDOW + STEP long.
 */
export async function loadHistory(
  profileId: string,
  /** The thread being continued. Null is a thread that has no messages yet. */
  conversationId: string | null,
): Promise<Anthropic.MessageParam[]> {
  // A brand-new thread has nothing behind it, which is the whole point of
  // starting one: the model sees this message and the state block, not last
  // week. It also means the cache breakpoint sits at the persona, which is
  // exactly where it should for the first turn of anything.
  if (!conversationId) return [];

  const scope = and(eq(messages.profileId, profileId), eq(messages.conversationId, conversationId));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(messages)
    .where(scope);
  const start = Math.max(0, Math.floor((total - WINDOW) / STEP) * STEP);

  const rows = await db
    .select()
    .from(messages)
    .where(scope)
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .offset(start);

  const ordered = rows.map((r) => ({
    role: r.role,
    content: r.content as Anthropic.ContentBlockParam[],
  })) satisfies Anthropic.MessageParam[];

  return trimToValidEnd(answerOrphans(trimToValidStart(elidePayloads(ordered))));
}

/**
 * Give every unanswered `tool_use` the `tool_result` the API insists on.
 *
 * `trimToValidEnd` below handles the orphan at the *end* of the transcript.
 * It cannot handle the same orphan one turn later: her next message is saved
 * before the history is loaded, so by then the dangling assistant turn is in
 * the middle, followed by a plain user message, and the API rejected every
 * turn from then on — "tool_use ids were found without tool_result blocks",
 * shown to her verbatim, forever. That is the transcript this repairs: a
 * meal plan and five food lookups, killed by the function's wall.
 *
 * Each orphan gets an error result saying it was interrupted, in a user
 * message inserted right after the assistant turn. The model reads it as
 * what it is and answers her latest message; nothing is deleted from what
 * she can see, and nothing is invented about what the tool would have said.
 */
function answerOrphans(list: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    out.push(m);
    if (m.role !== "assistant" || typeof m.content === "string") continue;
    const uses = m.content.filter((b): b is Anthropic.ToolUseBlockParam => typeof b === "object" && b.type === "tool_use");
    if (uses.length === 0) continue;

    const next = list[i + 1];
    const answered = new Set(
      next && next.role === "user" && typeof next.content !== "string"
        ? next.content.filter((b) => typeof b === "object" && b.type === "tool_result").map((b) => (b as Anthropic.ToolResultBlockParam).tool_use_id)
        : [],
    );
    const orphans = uses.filter((u) => !answered.has(u.id));
    if (orphans.length === 0) continue;

    const results: Anthropic.ToolResultBlockParam[] = orphans.map((u) => ({
      type: "tool_result",
      tool_use_id: u.id,
      is_error: true,
      content: "[interrupted before this tool finished — no result was recorded; call it again if it still matters]",
    }));
    if (next && next.role === "user" && typeof next.content !== "string" && answered.size > 0) {
      // A partial answer: complete it in place rather than splitting it.
      out.push({ role: "user", content: [...results, ...next.content] });
      i++;
    } else {
      out.push({ role: "user", content: results });
    }
  }
  return out;
}

/**
 * Drop a trailing assistant turn whose tool calls were never answered.
 *
 * Between saving the assistant message and saving the tool results sits the
 * tool run itself — which can be a 45-second planner call inside a function
 * capped at 60 seconds. Killed in there, the transcript ends with a `tool_use`
 * and no `tool_result`, and the API rejects *every* subsequent turn with
 * "tool_use ids were found without tool_result blocks".
 *
 * That is unrecoverable from inside the app: she is left with a coach that
 * errors on every message, forever, and no way to clear it. Dropping the
 * orphan costs one turn of context and fixes it.
 */
function trimToValidEnd(list: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = list.at(-1);
  if (!last || last.role !== "assistant" || typeof last.content === "string") return list;
  const dangling = last.content.some((b) => typeof b === "object" && b.type === "tool_use");
  return dangling ? list.slice(0, -1) : list;
}

const MAX_BLOCK_CHARS = 800;

/**
 * A single create_weekly_plan call can be 15,000 characters of JSON, and it
 * would otherwise be resent on every turn for the rest of the conversation —
 * input tokens (and cost) growing without bound.
 *
 * The blocks stay in place so tool_use/tool_result pairing still validates;
 * only their payloads are replaced. The coach loses nothing it can't recover by
 * calling get_plan or get_meal_plan, which read the live data anyway.
 *
 * Applied to every replayed message, not just older ones. Keeping the last
 * few verbatim meant each large payload was rewritten a few turns after it
 * happened, and every rewrite changed the cached prefix — a tool-heavy
 * conversation missed the history cache on most turns. The turn in flight
 * keeps its own payloads in memory regardless; only the replay is trimmed.
 */
function elidePayloads(list: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return list.map((message) => {
    if (typeof message.content === "string") return message;

    return {
      ...message,
      content: message.content.map((block) => {
        if (typeof block !== "object") return block;

        if (block.type === "tool_result" && typeof block.content === "string"
            && block.content.length > MAX_BLOCK_CHARS) {
          return { ...block, content: "[earlier result omitted — call the tool again for current data]" };
        }
        if (block.type === "tool_use" && JSON.stringify(block.input ?? {}).length > MAX_BLOCK_CHARS) {
          return { ...block, input: { _omitted: "large payload elided from history" } };
        }
        return block;
      }),
    };
  });
}

/**
 * A window that begins on a tool_result (or on an assistant turn) is rejected
 * by the API — every tool_result must follow its tool_use. Walk forward to the
 * first plain user message and start there.
 */
function trimToValidStart(list: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const isPlainUser = (m: Anthropic.MessageParam) =>
    m.role === "user" &&
    (typeof m.content === "string" ||
      !m.content.some((b) => typeof b === "object" && b.type === "tool_result"));

  const start = list.findIndex(isPlainUser);
  return start === -1 ? [] : list.slice(start);
}

export async function saveMessage(
  profileId: string,
  role: "user" | "assistant",
  content: Anthropic.ContentBlockParam[],
  conversationId: string,
) {
  await db.insert(messages).values({ profileId, role, content, conversationId });
  // What the list orders by. Bumped on every message rather than computed
  // from the messages table, so the list is one query and not a join with a
  // max() per row.
  await db.update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.profileId, profileId)));
}

/** How much of her first message becomes the thread's name in the list. */
export const TITLE_CHARS = 70;

/**
 * Open a thread, named after what she opened it with.
 *
 * Her first message trimmed, not a generated summary: a title is worth one
 * line in a list and not worth a model call each, and the first thing somebody
 * says is very nearly always what the thread turns out to be about.
 *
 * The briefing a screen prepends is deliberately not the title — she would get
 * a list of threads all called "She is looking at today's food", which is the
 * app's words and not hers.
 */
export async function startConversation(profileId: string, firstSaid: string): Promise<string> {
  const clean = firstSaid.replace(/\s+/g, " ").trim();
  const title = clean.length > TITLE_CHARS ? `${clean.slice(0, TITLE_CHARS - 1).trimEnd()}…` : clean;
  const [row] = await db.insert(conversations)
    .values({ profileId, title: title || null })
    .returning({ id: conversations.id });
  return row.id;
}

/**
 * Name a thread the first time she actually says something in it.
 *
 * An inline "coach's read" opens a thread with nothing she typed in it — the
 * turn is silent, so there is no title to take. If she then asks a follow-up,
 * that thread becomes visible, and without this it would sit in her history
 * as "Untitled chat" for ever. Only ever fills a blank: a thread already named
 * after her opening line keeps it.
 */
export async function nameIfUntitled(
  profileId: string, conversationId: string, said: string,
): Promise<void> {
  const clean = said.replace(/\s+/g, " ").trim();
  if (!clean) return;
  const title = clean.length > TITLE_CHARS ? `${clean.slice(0, TITLE_CHARS - 1).trimEnd()}…` : clean;
  await db.update(conversations)
    .set({ title })
    .where(and(
      eq(conversations.id, conversationId),
      eq(conversations.profileId, profileId),
      isNull(conversations.title),
    ));
}

/**
 * Her threads, newest first.
 *
 * The message count comes from a grouped subquery rather than a count per row:
 * a list of twenty threads was twenty round trips, on a screen that opens
 * every time she taps the coach.
 */
export async function listConversations(
  profileId: string,
  limit = 30,
): Promise<{ id: string; title: string | null; at: Date; messages: number }[]> {
  const counts = db
    .select({
      conversationId: messages.conversationId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(messages)
    .where(and(eq(messages.profileId, profileId), eq(messages.role, "user")))
    .groupBy(messages.conversationId)
    .as("counts");

  const rows = await db
    .select({
      id: conversations.id, title: conversations.title,
      at: conversations.lastMessageAt, n: counts.n,
    })
    .from(conversations)
    .leftJoin(counts, eq(counts.conversationId, conversations.id))
    .where(eq(conversations.profileId, profileId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);

  /*
    A thread with nothing she said in it is not a thread.

    The same rule `hasHistory` applies to the whole transcript, applied per
    thread: a turn can fail after the assistant's reply is written, and what
    is left is a row with no question in it. Listing those would fill the
    history with blanks she never opened.
  */
  return rows
    .filter((r) => (r.n ?? 0) > 0)
    .map((r) => ({ id: r.id, title: r.title, at: r.at, messages: r.n ?? 0 }));
}

/** The thread she was last in, for reopening rather than starting fresh. */
export async function latestConversation(profileId: string): Promise<string | null> {
  const [row] = await db.select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.profileId, profileId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return row?.id ?? null;
}

/** Hers, or nothing. Every read of a thread goes through this. */
export async function ownsConversation(profileId: string, conversationId: string): Promise<boolean> {
  const [row] = await db.select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.profileId, profileId)))
    .limit(1);
  return row !== undefined;
}

/**
 * A page of the conversation, newest first, ending at `before`.
 *
 * The sheet used to load the last forty messages and stop — everything older
 * than that was in the database and unreachable, which for anyone who has
 * been using this a while is most of what they have ever said. `hasMore`
 * comes from asking for one row more than the page and throwing it away, so
 * "load older" appears only when there is something older.
 *
 * Paged by `createdAt` and then by id: two messages written in the same
 * millisecond (a turn's user row and its assistant row) would otherwise let
 * a page boundary fall between them and repeat or skip one.
 */
export async function recentForDisplay(
  profileId: string,
  limit = 40,
  /** Load what came *before* this message — its id, from the oldest one shown. */
  before?: string,
  /** The thread to show. Null means she is starting a new one: nothing yet. */
  conversationId?: string | null,
): Promise<{
  messages: { id: string; role: "user" | "assistant"; text: string; at: Date }[];
  hasMore: boolean;
  /** Cursor for the next page: the oldest *row* fetched, shown or not. */
  oldestId: string | null;
}> {
  // Nothing she has said means nothing to show — the same rule hasHistory
  // uses, and the reason a stranded assistant fragment no longer greets her
  // on every open.
  // A thread she has not started has nothing in it, and asking the database
  // is a round trip to be told so.
  if (conversationId === null) return { messages: [], hasMore: false, oldestId: null };
  if (!(await hasHistory(profileId))) return { messages: [], hasMore: false, oldestId: null };

  const edge = before
    ? (await db.select({ at: messages.createdAt, id: messages.id })
        .from(messages).where(eq(messages.id, before)).limit(1))[0]
    : undefined;
  // A `before` that does not resolve would silently page from the top again
  // and loop the same forty messages for ever.
  if (before && !edge) return { messages: [], hasMore: false, oldestId: null };

  const rows = await db
    .select()
    .from(messages)
    .where(and(
      eq(messages.profileId, profileId),
      ...(conversationId ? [eq(messages.conversationId, conversationId)] : []),
      ...(edge ? [or(
        lt(messages.createdAt, edge.at),
        and(eq(messages.createdAt, edge.at), lt(messages.id, edge.id)),
      )!] : []),
    ))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  // Only surface human-readable text; tool traffic stays behind the scenes.
  // A page can come back entirely empty that way — a turn that was nothing
  // but tool calls — and `hasMore` is what stops that reading as the end.
  const shown = rows
    .reverse()
    .map((r) => {
      const blocks = r.content as Anthropic.ContentBlockParam[];
      const text = blocks
        .filter((b): b is Anthropic.TextBlockParam => typeof b === "object" && b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { id: r.id, role: r.role, text, at: r.createdAt };
    })
    .filter((m) => m.text.length > 0);

  // The cursor is the oldest *row* of the page, not the oldest shown message:
  // paging from a message we chose to display would re-fetch the tool-only
  // rows above it on every call and never get past them.
  return { messages: shown, hasMore, oldestId: rows[0]?.id ?? null };
}

/** Guards the one-time opening turn so it can't be replayed to spend tokens. */
/**
 * Whether there is a conversation to continue.
 *
 * A row is not a conversation: **it takes something she said.** A turn can
 * fail after the assistant's reply is written and before her next message —
 * or, as happened, the coach can answer an opening briefing by objecting to
 * it — and what is left is one assistant message with nothing before it.
 * That is not a thread; it is a fragment.
 *
 * Counting rows made it one. The fragment displayed on every open, and
 * because a row existed the opening was never sent again, so "new chat"
 * showed the same stranded paragraph for ever with no way to clear it from
 * the app. Asking for a user message heals every account in that state on
 * the next open, without anybody running anything against the database.
 */
export async function hasHistory(profileId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.profileId, profileId), eq(messages.role, "user")))
    .limit(1);
  return row !== undefined;
}

/** Window-shaping internals, exercised directly by tests/history.test.ts. */
export const __test = { trimToValidStart, trimToValidEnd, elidePayloads, answerOrphans };
