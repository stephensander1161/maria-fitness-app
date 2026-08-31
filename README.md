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
  progress/             Weight trend, week review, milestones
  learn/                Movement library (form + posture) and factoids
  api/chat              SSE streaming agent loop
  api/action            Direct tool invocation for the UI
lib/
  agent/                model config, system prompt, streaming tool loop, history
  tools/                the capability registry — the app's real API
  db/                   Drizzle schema + lazy pooled client
  progress.ts           week-over-week comparison engine
  views.ts              read models for the screens
  seed/                 exercise library and fact library
```

**Writes always go through the tool registry. Reads go through `lib/views.ts`.**
Keeping that seam clean is what stops the agent and the UI from drifting apart.

## Data model notes

- Weights are stored in kilograms, heights in centimetres, always. The UI and
  the tool boundary convert using the profile's `units` preference, so switching
  between pounds and kilos is a display change, never a migration.
- Day-level dates are `date` columns holding `YYYY-MM-DD` in local time — never
  timestamps, which is how workouts end up logged on the wrong day.
- Chat history stores raw Anthropic content blocks, so `tool_use`/`tool_result`
  pairs replay verbatim across sessions.

## Security

The app is gated by edge middleware that denies every path by default, behind a
passphrase and a signed httpOnly cookie. A hard daily spend ceiling ($0.50 by
default) is enforced before any model call, with real token usage recorded from
every response. Full details in [SECURITY.md](./SECURITY.md).

## Setup

```bash
npm install
cp .env.example .env        # ANTHROPIC_API_KEY, DATABASE_URL, AUTH_SECRET, APP_PASSPHRASE
npm run setup               # push schema + seed exercises and facts
npm run dev
```

Open http://localhost:3000. The coach opens the conversation itself and runs
onboarding — there is no setup form.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db:push` | Sync schema to the database (fast, dev) |
| `npm run db:generate` / `db:migrate` | Versioned migrations (production) |
| `npm run db:seed` | Upsert the exercise and fact libraries |
| `npm run db:studio` | Drizzle Studio |

## The model

Set in one place: `lib/agent/model.ts`. Currently `claude-haiku-4-5` for cheap
iteration. Swap to `claude-opus-5` there, or set `COACH_MODEL` in `.env`.

Haiku 4.5 predates adaptive thinking and `output_config.effort`, so neither is
sent. Both become available on an Opus 5 / Sonnet 5 swap and are worth turning on
for plan generation.

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
