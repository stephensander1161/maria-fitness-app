import type Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

/** Rows are stored as Anthropic content-block arrays, so replay is verbatim —
 *  tool_use and tool_result blocks survive a page reload intact. */
export async function loadHistory(profileId: string, limit = 40): Promise<Anthropic.MessageParam[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.profileId, profileId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const ordered = rows.reverse().map((r) => ({
    role: r.role,
    content: r.content as Anthropic.ContentBlockParam[],
  })) satisfies Anthropic.MessageParam[];

  return trimToValidStart(ordered);
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
