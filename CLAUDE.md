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
