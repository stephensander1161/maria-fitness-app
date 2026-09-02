# Coach

An agent-first fitness and nutrition app built for one person. The Anthropic API
drives it: the coach interviews her, writes her training and meal plans, adapts
them week to week, tracks every set, and tells her the truth about how it's going.

## Architecture

The whole design rests on one idea: **the agent's tools and the UI's actions are
the same functions.**

```
lib/tools/*.ts      one registry of capabilities (Zod schema + handler)
      │
      ├─ lib/agent/loop.ts   → the model calls them in a streaming tool loop
      └─ app/api/action      → the UI calls them directly, no model in the path
```

A tap on the weight stepper and the coach saying "log that set" run identical
code. Adding a capability means adding one entry to `lib/tools/index.ts`, and
both surfaces gain it at once.

```
app/
  page.tsx              Coach — the home screen, chat + onboarding
  train/                Fast-log workout surface (steppers, set dots)
  plan/                 The week: training days and meals
  progress/             Weight trend, tape measurements, week review, milestones
  learn/                Movement library (form + posture) and factoids
  api/chat              SSE streaming agent loop
  api/action            Direct tool invocation for the UI
lib/
  agent/                model config, system prompt, streaming tool loop, history
  tools/                the capability registry — the app's real API
  db/                   Drizzle schema + lazy pooled client
  progress.ts           week-over-week comparison + measurement/recomposition logic
  measurements.ts       tape sites and how to take each one consistently
  views.ts              read models for the screens
  seed/                 exercise library and fact library
```

**Writes always go through the tool registry. Reads go through `lib/views.ts`.**
Keeping that seam clean is what stops the agent and the UI from drifting apart.

The chat is not a place, it is a component. Anywhere there is something to ask
about — a movement in the library, an empty week, the coach's read on a screen
— `<AskCoach>` puts the conversation there, in the same transcript the Coach
tab shows. Nothing links back to the Coach tab to ask a question.

## Data model notes

- Weights are stored in kilograms, all lengths (height and tape measurements)
  in centimetres, always. The UI and the tool boundary convert using the
  profile's `units` preference, so switching between pounds and kilos is a
  display change, never a migration.
- Food is a separate preference. `profiles.food_units` (oz, cups, °F or g, ml,
  °C) is independent of the body one, because a kitchen in Canada is often
  imperial while the scale is metric or vice versa. Null means "follow the body
  units". Recipes are stored in metric and rewritten at the boundary by
  `lib/food-units.ts`.
- The shopping list can leave the app two ways: the share sheet (plain text),
  or as an Instacart cart when `INSTACART_API_KEY` is set — Costco delivers
  through Instacart in Canada. Only item names and quantities go; the event is
  audited.
- Measurement sites are stored as text against a list in `lib/measurements.ts`,
  so adding a new site is a code change rather than a migration.
- Day-level dates are `date` columns holding `YYYY-MM-DD` in local time — never
  timestamps, which is how workouts end up logged on the wrong day.
- Chat history stores raw Anthropic content blocks, so `tool_use`/`tool_result`
  pairs replay verbatim across sessions.

## Security

[COMPLIANCE.md](./COMPLIANCE.md) inventories the security controls against the
SOC 2 Common Criteria — including, honestly, the ones that don't exist. The app
is gated by edge middleware that denies every path by default, behind a
passphrase and a signed httpOnly cookie. A hard daily spend ceiling ($0.50 by
default) is enforced before any model call, with real token usage recorded from
every response. Full details in [SECURITY.md](./SECURITY.md).

## Setup

```bash
npm install
cp .env.example .env        # ANTHROPIC_API_KEY, DATABASE_URL, AUTH_SECRET, APP_TIMEZONE
                            # optional: INSTACART_API_KEY for "Send to Instacart"
npm run setup               # push schema + seed exercises and facts
npm run user -- add you@example.com "Your name"
npm run dev
```

The first account created becomes the owner. Add one per person — each account
gets its own profile and its own coach; no account can see another's data.

Open http://localhost:3000. The coach opens the conversation itself and runs
onboarding — there is no setup form.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db:push` | Sync schema to the database (fast, dev). Afterwards run `npm run tenancy`: it checks the one index Drizzle cannot express (`usage_daily_day … NULLS NOT DISTINCT`) survived |
| `npm run db:generate` / `db:migrate` | Versioned migrations (production) |
| `npm run db:seed` | Upsert the exercise and fact libraries |
| `npm run user -- list` | Accounts, roles, last sign-in |
| `npm run user -- add <email> [name]` | Create an account (prompts for a password) |
| `npm run user -- passwd <email>` | Change a password; signs that account out everywhere |
| `npm run user -- signout-everywhere <email>` | Revoke one account's sessions |
| `npm run feedback` | Read what she's asked for; set status and reply |
| `npm run backup` | Dump all her data to `backups/` as JSON |
| `npm run restore -- <file>` | Restore a backup, ids preserved |
| `npm run db:reset -- --yes` | Wipe her data (refuses without `--yes`) |
| `npm run db:studio` | Drizzle Studio |
| `npm run tenancy` | Two-account isolation check against the real database — run after touching any tool that takes an id |

## Backups

Neon's free tier has no point-in-time recovery, so a bad migration or a wrong
`DELETE` is unrecoverable. Take a backup before anything destructive:

```bash
npm run backup                                   # -> backups/coach-<stamp>.json
npm run restore -- backups/coach-20260831T2245.json
```

`db:reset` refuses to run without `--yes` for the same reason. Backups contain
her personal data and are gitignored — copy them somewhere durable.

## Feedback loop

She can report a bug or ask for a feature from any screen — the button records
which screen she was on — or just complain to the coach, which captures it with
`submit_feedback` and carries on. Pull them with:

```bash
npm run feedback                          # open items
npm run feedback -- --md                  # markdown, for pasting into a plan
npm run feedback -- --status a1b2 planned
npm run feedback -- --reply  a1b2 "shipped this morning"
```

Status and replies show up in the app next to her request, so she can see
something happened. That's what keeps the reports coming.

## The models

Two, split by job, both in `lib/agent/model.ts`:

- **`claude-haiku-4-5` for conversation.** Frequent, short, mostly reading tool
  results back to her. ~$0.0013 a turn with a warm cache.
- **`claude-sonnet-5` for plan and meal generation.** Rare — weekly at most — and
  where every observed quality failure lived.

`lib/agent/planner.ts` is a separate call rather than tool input from the chat
model. That matters: the planner is handed the real exercise catalogue filtered
to her equipment, so it cannot invent a slug, and its meal output is checked
against the calorie target before being written.

Measured effect: meal days went from ~200 kcal under target to within 40, and
plans now pick knee-friendly variants unprompted.

> If you change either model, update `PRICING` / `PLANNER_PRICING` alongside it
> or the spend cap computes against the wrong prices. There is a test for this.

The system prompt is split into a frozen persona block (carrying the cache
breakpoint) and a volatile state block, and the tool list is ordered
deterministically — so the expensive prefix stays warm across turns.

## Installing on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. It runs
full-screen with no browser chrome.

## Deploying

```bash
npx vercel
```

Set `ANTHROPIC_API_KEY` and `DATABASE_URL` in the Vercel project's environment
variables. The API key is only ever read in server code (`lib/env.ts`) and never
reaches the browser.

## Deploying

```bash
npx vercel login        # interactive, once
./scripts/deploy.sh     # links, pushes env vars, deploys to production
```

The script pushes only what the app needs — the Neon claim URL and the direct
(non-pooled) connection string stay on your machine. Subsequent deploys are just
`npx vercel deploy --prod`.

Functions run in `cle1` (Cleveland) to sit next to the Neon database in
`us-east-2` (Ohio); moving the database means changing `regions` in
`vercel.json` to match.

### Staying on free tiers

- **Vercel Hobby** — no card required. If limits are hit the project pauses
  rather than billing.
- **Neon Free** — the database auto-suspends when idle and wakes on demand.
- **Anthropic** — the app's own daily ceiling is the first line of defence, but
  it can only see its own usage. Set a spend limit on the Console workspace too,
  and **turn auto-reload off** — that's the only path to a surprise bill.
