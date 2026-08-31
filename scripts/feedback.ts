/**
 * Pull what she's asked for, and push status back so she sees it in the app.
 *
 *   npm run feedback                        open items (new + planned)
 *   npm run feedback -- --all               everything, including closed
 *   npm run feedback -- --md                markdown, for pasting into a plan
 *   npm run feedback -- --status a1b2 planned
 *   npm run feedback -- --reply  a1b2 "shipped this morning"
 *
 * Ids are matched on any unique prefix, so the short id shown is enough.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";

const STATUSES = ["new", "planned", "shipped", "declined"] as const;
type Status = (typeof STATUSES)[number];

const C = {
  dim: "\x1b[90m", bold: "\x1b[1m", reset: "\x1b[0m",
  idea: "\x1b[36m", bug: "\x1b[31m", confusing: "\x1b[33m",
  new: "\x1b[37m", planned: "\x1b[33m", shipped: "\x1b[32m", declined: "\x1b[90m",
};

const short = (id: string) => id.slice(0, 8);
const day = (d: Date) => d.toISOString().slice(0, 10);

async function findByPrefix(prefix: string) {
  const rows = await db.select().from(feedback);
  const matches = rows.filter((r) => r.id.startsWith(prefix));
  if (matches.length === 0) throw new Error(`No feedback matching '${prefix}'`);
  if (matches.length > 1) throw new Error(`'${prefix}' matches ${matches.length} items — use more characters`);
  return matches[0];
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--status") {
    const [, prefix, status] = args;
    if (!STATUSES.includes(status as Status)) {
      throw new Error(`Status must be one of: ${STATUSES.join(", ")}`);
    }
    const row = await findByPrefix(prefix);
    await db.update(feedback)
      .set({
        status: status as Status,
        resolvedAt: status === "shipped" || status === "declined" ? new Date() : null,
      })
      .where(eq(feedback.id, row.id));
    console.log(`${C.bold}${short(row.id)}${C.reset} → ${status}\n  ${row.body}`);
    return;
  }

  if (args[0] === "--reply") {
    const [, prefix, ...rest] = args;
    const text = rest.join(" ");
    if (!text) throw new Error("Provide a reply, e.g. --reply a1b2 \"done, it's on Progress now\"");
    const row = await findByPrefix(prefix);
    await db.update(feedback).set({ reply: text }).where(eq(feedback.id, row.id));
    console.log(`${C.bold}${short(row.id)}${C.reset} replied — she'll see it in the app.\n  ↳ ${text}`);
    return;
  }

  const all = args.includes("--all");
  const markdown = args.includes("--md");

  const rows = await db.select().from(feedback).orderBy(desc(feedback.createdAt));
  const visible = all ? rows : rows.filter((r) => r.status === "new" || r.status === "planned");

  if (visible.length === 0) {
    console.log(all ? "No feedback yet." : "Nothing open. (--all to see closed items.)");
    return;
  }

  if (markdown) {
    // Grouped by kind so a planning session reads as a backlog, not a stream.
    for (const kind of ["bug", "confusing", "idea"] as const) {
      const group = visible.filter((r) => r.kind === kind);
      if (group.length === 0) continue;
      console.log(`\n## ${{ bug: "Bugs", confusing: "Confusing", idea: "Ideas" }[kind]}\n`);
      for (const r of group) {
        console.log(`- [ ] **${short(r.id)}** ${r.body}`);
        console.log(`      ${[r.path && `on \`${r.path}\``, day(r.createdAt), r.status !== "new" && r.status]
          .filter(Boolean).join(" · ")}`);
      }
    }
    console.log();
    return;
  }

  console.log(`\n${C.bold}${visible.length} item${visible.length === 1 ? "" : "s"}${C.reset}${all ? "" : " open"}\n`);
  for (const r of visible) {
    const kindColor = C[r.kind];
    console.log(
      `${C.dim}${short(r.id)}${C.reset}  ${kindColor}${r.kind.padEnd(9)}${C.reset}` +
      `${C[r.status]}${r.status.padEnd(9)}${C.reset}${C.dim}${day(r.createdAt)}` +
      `${r.path ? `  ${r.path}` : "  via coach"}${C.reset}`,
    );
    console.log(`          ${r.body}`);
    if (r.reply) console.log(`          ${C.dim}↳ ${r.reply}${C.reset}`);
    console.log();
  }
  console.log(`${C.dim}  npm run feedback -- --status ${short(visible[0].id)} planned${C.reset}`);
  console.log(`${C.dim}  npm run feedback -- --reply  ${short(visible[0].id)} "on it"${C.reset}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
