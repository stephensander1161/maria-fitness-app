# Coach — working notes

Agent-first fitness app. Next.js 16 App Router, Drizzle + Postgres (Neon),
Anthropic SDK. Single user; `lib/profile.ts` resolves "her" and is the only
place real auth would need to land.

## The rule that matters

Every mutation goes through the tool registry in `lib/tools/`. The agent loop
and the UI's `/api/action` route both call `runTool`. **Never add a write path
that bypasses it** — that's the seam that keeps the coach and the screens
consistent with each other.

Reads for screens go through `lib/views.ts` (read models). Reads for the agent
go through tools, so it gets the same numbers she sees.

## Conventions

- Canonical storage is metric (kg, cm). Convert at the boundary via `lib/units.ts`.
  Tool inputs and outputs are always in *her* display units — the model never
  does unit arithmetic.
- Exercises are addressed by **slug**, never UUID, everywhere the model can see.
  Unknown slugs return a recoverable `{ ok: false, unknownSlugs }` result rather
  than throwing, so the model can call `search_exercises` and retry.
- Day-level dates are `YYYY-MM-DD` strings via `lib/date.ts`. Week starts Monday;
  `dayOfWeek` is 0=Monday … 6=Sunday throughout.
- Pages that read the database need `export const dynamic = "force-dynamic"`.
- `lib/db` connects lazily — do not move the pool construction to module scope,
  the build's page-data collection will break.

## Prompt caching

`lib/agent/system.ts` splits the system prompt: frozen persona (with the
`cache_control` breakpoint) then volatile state. `lib/tools/index.ts` keeps the
tool array in a fixed order. Both are load-bearing — reordering tools or putting
a timestamp in the persona silently kills the cache.

## Model

`lib/agent/model.ts`. On Haiku 4.5 (current default) do not send
`thinking: {type: "adaptive"}` or `output_config.effort` — that model predates
both. They're available and worth enabling after switching to Opus 5.

## Every feature ships its tools

This app's premise is that she can do anything by asking the coach instead of
tapping. A feature that only exists as a screen breaks that premise quietly —
she asks for it, the coach says it can't, and she stops asking.

So: **a new feature is not done until its tools are registered.** Concretely,
when you add a table or a screen that writes something:

1. Write the tools first, in `lib/tools/<feature>.ts`. Read, write, and any
   correction she might want to make by voice.
2. Register them in `lib/tools/index.ts`. Order does not matter — the list is
   sorted by name at construction, because hand-ordering had already drifted and
   tool order is the first thing hashed for prompt caching.
3. Build the screen on top of those tools via `action()`. Never add a second
   write path.
4. Write the tool description to lead with what it *does*. Leading with a
   constraint gets read as a refusal — that is exactly how `set_coach_budget`
   came to answer "I don't have control over that" while holding the tool.

`tests/tool-coverage.test.ts` enforces all of this and fails the build if a
table has no tools, if the UI calls something outside the registry, or if a tool
is hidden from the model without justification. Those tests are verified to
actually fail when violated — don't weaken them to get a feature through.

`uiOnly` takes the *reason*, not a boolean, and its allowlist is hard-coded in
the test. The only current entry is `add_progress_photo`, because the model
cannot produce a resized JPEG. "The UI does it" is not a reason — that is true
of nearly every tool here.

## Unknown is not zero

The most repeated bug class in this app is a missing value summed as if it
were a measurement. It has now been caught four separate times:

- Fibre is known only for food looked up against the library. A meal typed in
  words carries no figure, so a day's total is a **floor** — the UI writes
  "≥12g" and `fibreForDay` returns `knownFor`/`unknownFor` alongside the grams.
- A day with no meal logs is not a zero-calorie day. `summariseNutrition`
  averages logged days only, and a window less than half logged reports
  `under-logged` and refuses to judge her eating at all.
- A portion in a measure the food is not sold in (`1 glass rice`) returns
  `null` from `toGrams` rather than a plausible number.
- Chia and flaxseed carried total carbohydrate where every other row carries
  available carbohydrate, so their fibre was counted twice.

The rule: when you do not know something, the count of what you do not know
travels with the number, and anything rendering it says which it is. Summing
nulls as zeros always fails in the direction that reads as *her* failure —
under-reported fibre, an invented deficit, a day she "barely ate". That is the
worst possible direction for this particular app to be wrong in.

## Context injected into the prompt

`lib/agent/loop.ts` assembles a volatile state block (today's logged sets, the
week's plan, milestone progress, the recomposition signal). This has been the
single most effective way to fix wrong answers — four separate bugs were fixed
by stating a fact rather than hoping the model would look it up.

It is also the most dangerous, because **the model believes it completely.**
`todaySnapshot` once collapsed a session onto the first set's weight and
reported "6×8 @ 60lb" for a session ending in three sets at 95, and the coach
correctly-but-wrongly told her she hadn't hit her milestone. If you add to that
block, it must be exactly true, in her units, and labelled for what it is —
planned targets read as achievements unless you say otherwise.

## Accounts

`users` holds accounts; `profiles` holds training data, one per account. The
account is who you are, the profile is what you're working on.

- Server components call `requireUser()`; API routes call `currentUser()` and
  return 401. Never call `getProfile()` without a user id — it is scoped now.
- Middleware only verifies the session signature and expiry, because the edge
  has no database. Disabled accounts and "sign out everywhere" are enforced in
  `lib/session.ts`. Both layers are load-bearing; do not drop either.
- `users` is deliberately out of the model's reach (asserted in
  tests/tool-coverage.test.ts). No prompt should be able to change a password,
  enable an account, or read a hash.
- Passwords never come from argv — `npm run user` prompts with echo off, because
  a command line lands in shell history and the process table.

## Security controls

COMPLIANCE.md is the inventory of what exists, what doesn't, and the standing
rules. Two that bite most often:

- **Anything touching auth, spend limits, or the movement or deletion of her
  data calls `audit()`** (`lib/audit.ts`). Never log a credential, a passphrase
  attempt — even hashed, since that is a wordlist — or her body data.
- **CI is the only review this project has.** Typecheck, lint, tests, dependency
  audit, a build that proves nothing needs a secret at module load, and a scan
  of git history for credentials. It must pass before deploy.

If you remove a control, remove it from COMPLIANCE.md too. A stale readiness
document is worse than none, because it gets believed.

## Security invariants — do not regress these

- `middleware.ts` denies by default. Never convert it to an allow-list of
  protected paths; new routes must be protected automatically. Adding to
  `PUBLIC_PATHS` exposes something publicly — treat it as a deliberate decision.
- A missing `AUTH_SECRET` must fail closed (503), never fall open.
- Every model call goes through `checkChatAllowed()` first, and every response's
  usage through `recordUsage()` — including inside the tool loop.
- If `COACH_MODEL` changes, `PRICING` in `lib/agent/model.ts` must change with
  it, or the spend cap computes against the wrong prices.
- Rate-limit and usage state belongs in Postgres. In-memory counters do not work
  on serverless and would silently enforce nothing.
- Never render model output as HTML. `components/rich-text.tsx` builds React
  nodes on purpose.

See SECURITY.md for the full model.
