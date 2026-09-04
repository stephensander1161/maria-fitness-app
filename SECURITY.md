# Security model

Private, single-user app. The threat that matters is not data theft — it's an
open door in front of a metered API. Anyone who can reach `/api/chat` can spend
your Anthropic credits.

## Perimeter

`middleware.ts` runs on the edge and **denies by default**. Only `/login`,
`/api/login`, `/robots.txt` and the PWA manifest are public; every other path —
including any route added in future — is gated without anyone remembering to
list it. An unauthenticated request never reaches the database or the model.

A missing `AUTH_SECRET` returns 503 rather than falling open.

## Authentication

Per-user accounts. Passwords are hashed with scrypt at OWASP's minimum
parameters (N=2^17, r=8, p=1) using Node's standard library — memory-hard, so
GPU cracking is expensive, and no dependency to audit. Each password gets its own
salt, and the parameters are recorded inside the hash so they can be raised later
without invalidating anyone; a hash below current parameters is upgraded silently
on the next correct sign-in.

A failed sign-in verifies against a dummy hash when the address is unknown, so a
missing account costs the same ~200ms as a wrong password and response time
cannot be used to enumerate accounts. Every failure returns the same message.

There is no open registration. The accounts table is the allowlist, and the only
thing that adds to it is `npm run user -- invite` (or `add`). `/signup` lets an
invited person choose their own password rather than have one typed for them:
it claims an invitation that nobody has used — no password, never linked to
Google, never signed in — and refuses everything else with one message, so the
form cannot be used to read the list. The claim is a conditional update, so two
sign-ups for one address cannot both land. The residual risk is the window
between an invitation and its first use, during which anyone who knew the
address could claim it; invite people when they are about to sign in, and
`npm run user -- list` shows who has and hasn't.

Sessions are checked in two layers. The edge middleware verifies the signature
and expiry — cheap, and enough to turn away anyone without a valid token before
any code runs. A stateless token cannot know that an account was disabled a
minute ago, so `lib/session.ts` re-checks in Node, where the database is
reachable: the account must still exist, be enabled, and the token must have been
issued after that account's `sessionsValidFrom`.

The account id is inside the signed payload, so a session cannot be re-pointed at
someone else's data.

Cookie is `httpOnly` (unreachable from JavaScript, so XSS cannot lift it),
`secure` in production, `sameSite=lax` (which is what makes cross-site POSTs
fail, so no CSRF token is needed).

Revocation: `npm run user -- signout-everywhere <email>`, disabling an account,
or changing its password all invalidate that account's sessions immediately and
leave everyone else's alone. Rotating `AUTH_SECRET` invalidates all of them.

Data reaching another person has exactly two paths, both opt-in. **Friends**
(`lib/friends.ts`) share training only — sessions, streak, hard sets, best
lifts — after both sides agree; a pending request discloses nothing, either
side can end it, and people are found by a resettable code rather than by
email, so the feature cannot be used to test whether an address has an account.
**The owner console** (`/admin`, gated on `users.role`) summarises accounts,
activity counts, spend and the audit log; it never shows anyone's weight,
measurements, photos, meals or conversation, and every view is recorded as
`admin.viewed`. Neither path is reachable by the model: no tool touches
`users`, and the console has no tools at all.

What the database holds about her: account and credentials (`users`), training
and food data, tape measurements, progress photos as blobs, the coach
conversation, and — since the niggle log — what she has reported as hurting.
The last of those is the most sensitive thing here after the photos; it is
readable by the coach, included in backups, and cascades on account deletion
like everything else.

Brute force is capped twice: 10 attempts/hour per IP, and **200/hour globally**
(`MAX_LOGIN_ATTEMPTS_PER_HOUR_GLOBAL`; this document said 40 while the code
said 200 — the code is what runs).
The global ceiling is the one that matters — `x-forwarded-for` is ultimately
client-supplied, so a per-IP limit alone can be rotated around.

Every limiter records the attempt *before* counting, so a burst of parallel
requests cannot all pass a check that none of them has yet been counted
against. A refused request therefore still spends a slot — that is the point.

## Spend

`lib/limits.ts` holds a hard daily ceiling checked *before* any model call, and
records real token usage from every response's `usage` block — including each
iteration of a tool loop, which is where a runaway would actually spend money.

| Guard | Default | Env override |
|---|---|---|
| Daily cost | $0.50 | `DAILY_COST_LIMIT_MICROS` |
| Messages/day | 250 | `MAX_CHAT_PER_DAY` |
| Messages/minute | 8 | `MAX_CHAT_PER_MINUTE` |
| Message length | 4000 chars | `MAX_MESSAGE_CHARS` |
| Tool loop iterations | 12 | `lib/agent/model.ts` |

Counters live in Postgres, not memory — on serverless every request can land on
a fresh instance, so an in-memory counter would enforce nothing.

When the ceiling trips, chat pauses until tomorrow. Logging, plans, progress and
every other screen keep working.

> **If you change `COACH_MODEL`, update `PRICING` in `lib/agent/model.ts`.**
> Pricing the wrong model silently disarms the cap.

## Cost shape

Steady-state is roughly **$0.0013 per turn** with a warm prompt cache, rising to
about $0.013 on the first message after a gap (the cache has a 5-minute TTL, and
a cold write bills at 1.25× input). History is bounded: tool payloads older than
the last six messages are elided on replay, so a 15,000-character plan-generation
call isn't resent forever.

## Application surface

- The API key is read only in server code (`lib/env.ts`) and never reaches the browser.
- Coach output renders through `components/rich-text.tsx`, which builds React
  nodes. Nothing in the app uses `dangerouslySetInnerHTML`. The only markup
  it will build from model text is bold, code, lists, and `https:` links —
  no other scheme becomes an href.
- Every tool input is parsed with Zod before the handler runs; bad arguments
  return a correctable message rather than throwing.
- Tool handlers are scoped to a `profileId` supplied by the server, never the client.
- `/api/action` logs errors server-side and returns a generic message — stack
  traces and database errors are reconnaissance.
- CSP allows no external origins at all. `connect-src 'self'` means that even if
  something coaxed a malicious URL out of the model, the browser has nowhere to
  send anything.
- The server makes exactly two kinds of outbound call: Anthropic, and — when
  `INSTACART_API_KEY` is set and she asks — Instacart, which receives the
  week's shopping list (item names and quantities, nothing about her) and
  answers with a link. `lib/instacart.ts` is the whole of that surface, and
  each send is written to the audit log.
- `robots.txt` disallows everything and `X-Robots-Tag: noindex` is set on every
  response, so the deployment URL should not turn up in search.

## What this does not protect against

- Someone who knows the passphrase. Change it if it leaks; sessions survive a
  passphrase change, so rotate `AUTH_SECRET` too if you need to force logouts.
- A compromised Anthropic key used *outside* this app. The in-app ceiling can't
  see that — set a spend limit on the Console workspace as well.
