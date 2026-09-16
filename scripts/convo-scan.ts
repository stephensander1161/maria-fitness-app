/**
 * Scan every conversation for the marks a bug leaves, without reading anyone.
 *
 *   npm run convo-scan              the last 14 days
 *   npm run convo-scan -- --days 60
 *
 * His request: "Another convo history scan across all users for bugs might be
 * a worthy exercise." The line this holds to is the one /admin holds to: the
 * owner does not read another adult's conversation. So it never prints what a
 * person said. It prints what the *app* did wrong — a tool that errored, a
 * tool that refused, an assistant turn that said it could not, a request the
 * server rejected — with counts, ids and the app's own words, and nothing of
 * hers beyond the length of the message.
 *
 * Read-only. It touches nothing.
 */
import { and, desc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { appErrors, messages } from "@/lib/db/schema";

const C = { dim: "\x1b[90m", bold: "\x1b[1m", reset: "\x1b[0m", bad: "\x1b[31m", warn: "\x1b[33m" };
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };

type Block = { type?: string; text?: string; is_error?: boolean; content?: unknown; name?: string; input?: unknown };

/** The app's own words for "no": a tool result that reports failure. */
function toolFailure(b: Block): string | null {
  if (b.type !== "tool_result") return null;
  if (b.is_error) return `is_error: ${String(b.content).slice(0, 120)}`;
  const text = typeof b.content === "string" ? b.content
    : Array.isArray(b.content) ? (b.content as Block[]).map((c) => c.text ?? "").join(" ") : "";
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; error?: string };
    if (parsed.ok === false || parsed.error) return `refused: ${(parsed.error ?? "ok:false").slice(0, 120)}`;
  } catch { /* not JSON, not a structured refusal */ }
  return null;
}

/** An assistant turn that says it cannot, which is the coach's version of a refusal. */
const CANNOT = /\b(I can(?:')?t|I cannot|I(?:'m| am) (?:not able|unable)|I don(?:')?t have (?:access|a way|the ability)|not something I can)\b/i;

async function main() {
  const days = Number(arg("days") ?? 14);
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select({
    id: messages.id, profileId: messages.profileId, conversationId: messages.conversationId,
    role: messages.role, content: messages.content, at: messages.createdAt,
  }).from(messages).where(gte(messages.createdAt, since)).orderBy(desc(messages.createdAt));

  const byConvo = new Map<string, { profile: string; turns: number; failures: string[]; cannot: number; leaks: number; last: Date }>();
  for (const r of rows) {
    const key = r.conversationId ?? "(none)";
    const c = byConvo.get(key) ?? { profile: r.profileId, turns: 0, failures: [], cannot: 0, leaks: 0, last: r.at };
    c.turns++;
    const blocks = Array.isArray(r.content) ? (r.content as Block[]) : [];
    for (const b of blocks) {
      const f = toolFailure(b);
      if (f) c.failures.push(f);
      if (r.role === "assistant" && b.type === "text" && b.text && CANNOT.test(b.text)) c.cannot++;
      // The app's furniture in a person's own message: a briefing or a cache
      // marker that should never have been saved.
      if (r.role === "user" && b.text?.startsWith("<current_state>")) c.leaks++;
      if ("cache_control" in (b as object)) c.leaks++;
    }
    byConvo.set(key, c);
  }

  const errs = await db.select({ at: appErrors.at, route: appErrors.route, message: appErrors.message })
    .from(appErrors).where(and(gte(appErrors.at, since))).orderBy(desc(appErrors.at)).limit(200);
  const chatErrs = errs.filter((e) => /\/api\/(chat|action|messages)/.test(e.route));

  console.log(`${C.bold}${rows.length} messages in ${byConvo.size} conversations across ${new Set([...byConvo.values()].map((c) => c.profile)).size} profiles, last ${days} days${C.reset}\n`);
  const flagged = [...byConvo.entries()].filter(([, c]) => c.failures.length || c.cannot || c.leaks)
    .sort((a, b) => (b[1].failures.length + b[1].cannot + b[1].leaks) - (a[1].failures.length + a[1].cannot + a[1].leaks));
  for (const [id, c] of flagged) {
    console.log(`${C.dim}${c.last.toISOString().slice(0, 16)}${C.reset} convo ${id.slice(0, 8)} · profile ${c.profile.slice(0, 8)} · ${c.turns} turns`
      + (c.failures.length ? ` ${C.bad}${c.failures.length} tool failure${c.failures.length === 1 ? "" : "s"}${C.reset}` : "")
      + (c.cannot ? ` ${C.warn}${c.cannot} "I can't"${C.reset}` : "")
      + (c.leaks ? ` ${C.bad}${c.leaks} leaked app text${C.reset}` : ""));
    const seen = new Map<string, number>();
    for (const f of c.failures) seen.set(f, (seen.get(f) ?? 0) + 1);
    for (const [f, n] of seen) console.log(`   ${n > 1 ? `${n}× ` : ""}${f}`);
  }
  if (flagged.length === 0) console.log("No tool failures, refusals or leaks found.");

  if (chatErrs.length) {
    console.log(`\n${C.bold}${chatErrs.length} server-side errors on the chat routes${C.reset}`);
    const seen = new Map<string, number>();
    for (const e of chatErrs) { const k = `${e.route} ${e.message.slice(0, 110)}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    for (const [k, n] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${n}× ${k}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
