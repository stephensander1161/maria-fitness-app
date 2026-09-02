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
- Food has its own units preference (`profiles.food_units`, null = follow the
  body one). Recipes and shopping quantities are stored metric and rewritten by
  `lib/food-units.ts` at every output boundary; tools reach for
  `foodUnitsFor(profileId)`, pages for `foodUnitsOf(profile)`. The planner is
  told to write metric so there is one source to convert from.
- Exercises are addressed by **slug**, never UUID, everywhere the model can see.
  Unknown slugs return a recoverable `{ ok: false, unknownSlugs }` result rather
  than throwing, so the model can call `search_exercises` and retry.
- Day-level dates are `YYYY-MM-DD` strings via `lib/date.ts`. Week starts Monday;
  `dayOfWeek` is 0=Monday … 6=Sunday throughout.
- **A day-level date is always computed in the profile's timezone**, never the
  server's — `todayForProfile(profileId)` in a tool, `profileToday(profile)` on
  a page. Bare `today()` reads `APP_TIMEZONE` and is only correct as a
  parameter default that the caller then overrides. `profiles.timezone` is per
  user; `APP_TIMEZONE` is one global. They agree today by coincidence, and a
  second user anywhere else files their dinner on the wrong day.
  `isFuture(date, asOf)` takes her today for the same reason: judged against
  the server's, a user ahead of it cannot log anything at all.
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

A screen may fire a model call by itself — the meal panel asks for a recipe the
week planner left blank — but only through a tool, and only once: the tool
writes the answer back with a conditional update (`where jsonb_array_length(
steps) = 0`), so a second tap cannot overwrite a recipe she is already reading
and the next open costs nothing. A screen that spends money every time it is
opened is a screen that quietly empties her allowance.

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
- **A meal logged in words carries no calorie figure either.** "Leftovers",
  "dinner at Mum's" — real entries, no numbers, and they were summed as zero.
  The day counted as logged, averaged 0 kcal in, and every one of them was
  reported as a day at or under target: the coach congratulated her on a
  deficit she never ran. `NutritionDay` now carries `entriesCounted` and
  `caloriesComplete`, `summariseNutrition` averages only fully-counted days,
  and the UI writes "≥1150" the way it already wrote "≥12g" for fibre.
- The kitchen holds four states that a boolean would flatten into two: an
  amount, `null` for "she has some, nobody counted it", `0` for known to be
  out, and no row at all for never bought. Only *out*, *short* and *missing*
  mean buy it. `compareStock` reports a mismatch of measures as `unknown`
  rather than guessing, and cooking with an unmeasured line sets the stock to
  `null` — she used some, so the old number is no longer true and zero would
  be a lie in the other direction.

The rule: when you do not know something, the count of what you do not know
travels with the number, and anything rendering it says which it is. Summing
nulls as zeros always fails in the direction that reads as *her* failure —
under-reported fibre, an invented deficit, a day she "barely ate". That is the
worst possible direction for this particular app to be wrong in.

## Weight is a trend, not a reading

`lib/trend.ts`. Everything that talks about her weight over time talks about
the EWMA, ten-day half-life, α derived from the *gap* between weigh-ins so a
fortnight away does not let a stale reading keep its full weight. Raw numbers
are still hers and still shown — dots behind the line on the sparkline, "last
weigh-in" under the trend — but no screen and no sentence reads a single
morning as progress.

The second half is refusing to answer. `weeklyChangeKg` is **null** unless
there are five weigh-ins in the last fortnight and one in the last three days;
`confidence` says which. A fortnightly weigher told she gained half a kilo
because she happened to weigh in bloated is the exact failure this app is
built not to have.

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

## Her kitchen

`pantry_items` is what she actually has in. Planned meals take from it when she
logs them (`log_meal` with a `mealId` — a meal described in words carries no
ingredient list, so nothing is guessed), the shopping list puts it back
(`mark_shopping_bought`), and `get_shopping_list` marks every line against it so
she is not sent to buy rice she has a bag of.

Two rules hold the whole thing up:

- **Amounts are never converted.** Grams, tablespoons and tins are compared
  like with like, and a mismatch is `unknown`, not a number. This is the same
  rule as `lib/shopping.ts` — "4 eggs plus 2 eggs" is six eggs, not 300g.
- **Unknown is a value, not a gap.** See above; `lib/pantry.ts` is where it
  lives and `tests/pantry.test.ts` is mostly tests of that one distinction.

The unit column stores `""` rather than NULL for "no unit", because uniqueness
of `(profile, item, unit)` is what stops a restock inserting a second row and
Postgres never considers two NULLs equal. `npm run tenancy` asserts the index
is still unique after a `db:push`.

## The guided setup

`run_plan_setup` is the interactive intake — days a week, session length, what
she wants to work, equipment, injuries, food — and it rebuilds the week from
the answers. It is deliberately re-runnable, offered once on the home screen and
available from Progress from then on; `skip_plan_setup` puts the invitation away
without deleting anything (`profiles.plan_setup_at` / `plan_setup_skipped_at`).

It returns the calorie and protein targets rather than planning the meals
itself, and the screen makes a second call to `create_meal_plan`. **Two planner
calls in one request blow the 60-second function limit** — she ends up on a
spinner with half a plan.

## The coach is not a place

There is no Coach tab. `components/coach-bubble.tsx` floats on every screen
(mounted in the root layout via `CoachBubbleGate`), and `<AskCoach>` puts an
inline thread next to a specific thing — a movement, an empty week. All of it
is one conversation through `useCoachThread()` / `ThreadMessages` / `Composer`.

**A message sent from a screen carries that screen.** The browser sends the
*path*; `contextForPath()` reads what is on it and the route prepends it to her
message. The client never authors context — same rule as the opening greeting,
and the model believes this block completely. It is attached once per screen
per session, not per message, and `runCoach`'s `save` option keeps the briefing
out of the transcript so she sees her own sentence in the conversation.

The chat sheet is a flex column: header, a `min-h-0 flex-1 overflow-y-auto`
thread, then the composer *outside* the scroller. The tab version grew the page
under a fixed composer instead, and the newest message sat behind it — she had
to scroll down to read the answer she had just been given.

`tests/inline-coach.test.ts` fails the build on a new `href="/"`, on a
`router.push("/")` outside sign-in, on a component calling `streamCoach`
instead of the shared hook, and if the bubble ever stops being mounted globally.

Activity labels live in `lib/tool-labels.ts` — one map for the browser and the
server loop, because the two copies had drifted twenty tools apart.

## What a screen owes her

- **A dialog behaves like one.** `useDialog()` — Escape, a real focus trap,
  focus restored to whatever opened it. `aria-modal="true"` over a sheet you
  can Tab out of is worse than no dialog: it tells a screen reader the page
  behind is inert while she edits it blind.
- **A failure is announced, not just coloured.** Error text carries
  `role="alert"`. Twenty-one error paragraphs were rendered to nobody.
- **`--color-line` is decorative; `--color-edge` is a control's outline** and
  clears 3:1 on every surface. An unticked checkbox and a set not yet logged
  are information, and at 1.31:1 they were invisible in a bright gym.
- **Never `aria-live` a value that repaints.** The rest timer queued ~360
  announcements per rest, blocking everything else for the whole rest.
- **An empty state is not `return null`.** A card that disappears is
  indistinguishable from one that is broken, and she never learns the feature
  exists.
- Every route has `error.tsx` above it. One Neon blip used to replace a tab
  with Next's unstyled white page — no tab bar, no way back, and in a
  standalone PWA no browser chrome either.

`tests/accessibility.test.ts` enforces the first four, including the contrast
ratios, computed from the tokens rather than eyeballed.

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
- **Probes never write to real rows.** A script that needs data creates a
  throwaway account and deletes it (`scripts/tenancy-check.ts` is the pattern).
  An overnight probe once overwrote the real profile with fake data and the
  coach greeted the wrong person for a day. If a real-row write is needed, the
  script goes in the scratchpad and the owner runs it.
- **Third parties are enumerated.** Anthropic and, optionally, Instacart
  (`lib/instacart.ts`) are the only places her data leaves the server. Adding
  another means an `audit()` call, a line in COMPLIANCE.md, and a reason.

If you remove a control, remove it from COMPLIANCE.md too. A stale readiness
document is worse than none, because it gets believed.

## Security invariants — do not regress these

- `middleware.ts` denies by default. Never convert it to an allow-list of
  protected paths; new routes must be protected automatically. Adding to
  `PUBLIC_PATHS` exposes something publicly — treat it as a deliberate decision.
- A missing `AUTH_SECRET` must fail closed (503), never fall open.
- Every model call goes through a spend gate **before** it is made, and every
  response's usage through `recordUsage()` after — including inside the tool
  loop. Chat turns use `checkChatAllowed()` (rate + spend, records an event);
  model calls made anywhere else use `checkSpendAllowed()` (spend only, records
  nothing), so a planner call during a turn does not spend a second message
  from her allowance. The planner had `recordUsage` without a gate: spend went
  onto the ledger with nothing reading it back, and `/api/action` reaches every
  registered tool, three of which call the planner model — two plan a week,
  and `get_meal_recipe` writes a single recipe, fired automatically by the
  meal screen the first time she opens a meal that has none.
- `/api/action` is rate-limited per profile (`checkActionAllowed`). It has the
  same reach as the chat route and must never again have less protection.
- If `COACH_MODEL` changes, `PRICING` in `lib/agent/model.ts` must change with
  it, or the spend cap computes against the wrong prices.
- Rate-limit and usage state belongs in Postgres. In-memory counters do not work
  on serverless and would silently enforce nothing.
- Never render model output as HTML. `components/rich-text.tsx` builds React
  nodes on purpose.

See SECURITY.md for the full model.
