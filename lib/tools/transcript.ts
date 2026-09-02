import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq, gte, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { defineTool } from "./define";

/**
 * The conversation, as text she can hand to someone.
 *
 * Written for one purpose: when the coach says something wrong, the fastest fix
 * is reading exactly what it said. Retyping it from a phone loses the detail
 * that matters, which is usually *which tool it called* — or that it called
 * none and answered from thin air. So the tool traffic is included, by name.
 *
 * Tool *results* are not: they are long, they are reconstructible from the
 * tool name and her data, and a transcript is something she may paste into a
 * message to someone who should not receive a dump of her body data.
 */
function render(rows: { role: string; content: unknown; createdAt: Date }[]): string {
  const lines: string[] = [];
  let day = "";

  for (const row of rows) {
    const stamp = row.createdAt.toISOString();
    const thisDay = stamp.slice(0, 10);
    if (thisDay !== day) {
      day = thisDay;
      lines.push(``, `── ${day} ──`);
    }
    const time = stamp.slice(11, 16);
    const blocks = (row.content ?? []) as Anthropic.ContentBlockParam[];
    if (!Array.isArray(blocks)) continue;

    for (const block of blocks) {
      if (typeof block !== "object" || block === null) continue;

      if (block.type === "text" && block.text.trim()) {
        lines.push(`[${time}] ${row.role === "user" ? "HER" : "COACH"}: ${block.text.trim()}`);
      } else if (block.type === "tool_use") {
        // The input, trimmed: enough to see what it asked for, not enough to
        // be a data export.
        const input = JSON.stringify(block.input ?? {});
        lines.push(`[${time}]   → ${block.name}(${input.length > 160 ? `${input.slice(0, 160)}…` : input})`);
      } else if (block.type === "tool_result" && block.is_error) {
        const text = typeof block.content === "string" ? block.content : "(error)";
        lines.push(`[${time}]   ✗ tool failed: ${text.slice(0, 200)}`);
      }
    }
  }

  return lines.join("\n").trim();
}

export const exportTranscript = defineTool({
  name: "export_transcript",
  description:
    "The conversation as plain text she can copy or send on — every message with a timestamp, and the name of each tool that ran. Use it when she wants a record of what was said, or when she is reporting that the coach got something wrong and someone needs to see it. Covers the last few days by default.",
  input: z.object({
    days: z.number().optional().describe("How far back, in days. Default 3, maximum 90."),
  }),
  handler: async (input, ctx) => {
    const days = Math.min(90, Math.max(1, Math.round(input.days ?? 3)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db.select()
      .from(messages)
      .where(and(eq(messages.profileId, ctx.profileId), gte(messages.createdAt, since)))
      .orderBy(asc(messages.createdAt));

    const text = render(rows);

    // Her data leaving the app in a form she can send on. Count only — the
    // conversation itself never goes in the log.
    await audit("data.exported", {
      detail: { profileId: ctx.profileId, scope: "transcript", days, messages: rows.length },
    });

    return {
      ok: true,
      days,
      messages: rows.length,
      text: text || "Nothing said in that window.",
      filename: `coach-transcript-${new Date().toISOString().slice(0, 10)}.txt`,
    };
  },
});
