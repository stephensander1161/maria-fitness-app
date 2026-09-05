/**
 * The requests an unattended agent is allowed to act on.
 *
 *   npm run requests            human-readable
 *   npm run requests -- --json  for a script to consume
 *
 * This exists so the allowlist is a *filter in code* rather than a line in a
 * prompt. The daily routine writes code from what this prints and then deploys
 * it, so "only these people's requests count" has to be something the agent
 * cannot talk itself out of — see lib/request-authors.ts.
 *
 * Rows from anyone else are counted and reported, never silently dropped: a
 * gate you cannot see working is one you stop trusting.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedback, profiles, users } from "@/lib/db/schema";
import { partitionRequests, REQUEST_AUTHORS } from "@/lib/request-authors";

async function main() {
  const rows = await db.select({
    id: feedback.id,
    kind: feedback.kind,
    body: feedback.body,
    path: feedback.path,
    createdAt: feedback.createdAt,
    email: users.email,
    name: profiles.name,
  }).from(feedback)
    .leftJoin(profiles, eq(profiles.id, feedback.profileId))
    .leftJoin(users, eq(users.id, profiles.userId))
    .where(eq(feedback.status, "new"))
    .orderBy(desc(feedback.createdAt));

  const { actionable: allowed, ignored } = partitionRequests(rows);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      actionable: allowed.map((r) => ({
        id: r.id, kind: r.kind, body: r.body, path: r.path, from: r.name ?? r.email,
      })),
      ignoredCount: ignored.length,
    }, null, 2));
    process.exit(0);
  }

  console.log(`${allowed.length} request(s) an agent may act on`);
  console.log(`  (allowlist: ${REQUEST_AUTHORS.join(", ")})\n`);
  for (const r of allowed) {
    console.log(`  ${r.id.slice(0, 8)}  ${r.kind.padEnd(9)} ${r.name ?? "?"} · ${r.createdAt.toISOString().slice(0, 10)} · ${r.path ?? "coach"}`);
    console.log(`     "${r.body.replace(/\n/g, " ")}"\n`);
  }
  if (ignored.length > 0) {
    // Named as a count, not as content: the point is that a human looks.
    console.log(`⚠ ${ignored.length} request(s) from outside the allowlist were NOT included.`);
    console.log("  Read them yourself with `npm run feedback` before acting on any of them.");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
