import type Anthropic from "@anthropic-ai/sdk";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

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
export async function loadHistory(profileId: string): Promise<Anthropic.MessageParam[]> {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.profileId, profileId));
  const start = Math.max(0, Math.floor((total - WINDOW) / STEP) * STEP);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .offset(start);

  const ordered = rows.map((r) => ({
    role: r.role,
    content: r.content as Anthropic.ContentBlockParam[],
  })) satisfies Anthropic.MessageParam[];

  return trimToValidEnd(trimToValidStart(elidePayloads(ordered)));
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
) {
  await db.insert(messages).values({ profileId, role, content });
}

export async function recentForDisplay(profileId: string, limit = 40) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Only surface human-readable text; tool traffic stays behind the scenes.
  return rows
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
}

/** Guards the one-time opening turn so it can't be replayed to spend tokens. */
export async function hasHistory(profileId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .limit(1);
  return row !== undefined;
}

/** Window-shaping internals, exercised directly by tests/history.test.ts. */
export const __test = { trimToValidStart, trimToValidEnd, elidePayloads };
