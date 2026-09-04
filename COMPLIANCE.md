# Security controls and SOC 2 readiness

## What this document is, and what it isn't

**This app is not SOC 2 compliant, and no amount of code will make it so.**

SOC 2 is an audit of an *organisation's* control environment against the AICPA
Trust Services Criteria, performed by an independent CPA firm, with evidence
collected over an observation window (3–12 months for Type II). It attests to
how a company operates — hiring, training, vendor management, incident response,
board oversight — not to how a codebase is written. There is no organisation
here, no auditor, and no customers to attest to.

What *is* real, and worth having, is the technical control set the Common
Criteria describe. Most of it is simply good engineering. This document records
which of those controls exist, which do not, and what would actually be required
if this ever needed a real attestation.

Read it as an honest inventory, not a certificate.

---

## Implemented

### CC6 — Logical access

| Control | Where |
|---|---|
| Deny-by-default perimeter; every route gated before any handler runs | `middleware.ts` |
| Fails closed — a missing `AUTH_SECRET` returns 503, never open access | `middleware.ts` |
| Per-user accounts; passwords hashed with scrypt at OWASP's N=2^17, per-password salt, parameters recorded in the hash so they can be raised later | `lib/password.ts` |
| Failed sign-in costs the same whether the address exists or not, so response time doesn't enumerate accounts | `app/api/login/route.ts` |
| Hashes upgraded transparently on next sign-in when parameters are raised | `lib/password.ts` |
| Stateless signed session: `httpOnly` (unreachable from JS), `secure` in production, `sameSite=lax` (blocks cross-site POST, so no CSRF token is needed) | `lib/auth.ts` |
| Two-layer session check: edge verifies signature and expiry, Node verifies the account still exists, is enabled, and hasn't been signed out everywhere | `middleware.ts`, `lib/session.ts` |
| Per-user revocation — `signout-everywhere`, disable, and password change all invalidate that account's sessions immediately, without touching anyone else's | `scripts/users.ts` |
| Account disable retains history rather than deleting it | `users.disabledAt` |
| Global revocation by secret rotation | `AUTH_SECRET` |
| Brute-force ceilings, per-IP **and** global — `x-forwarded-for` is client-supplied, so a per-IP limit alone can be rotated around | `lib/limits.ts` |
| Every tool handler scoped to a server-supplied `profileId`, never a client-supplied one | `lib/tools/` |
| Sharing training between accounts is opt-in both ways, carries training only (no weight, measurements, photos, food or conversation), and a *pending* request reveals nothing | `lib/friends.ts`, `tests/friends.test.ts` |
| Friends are found by a resettable share code, never by email — so no signed-in account can test whether an address has an account here | `profiles.share_code` |
| The owner console is gated on `users.role`, records every view, and shows counts and dates rather than anyone's body or training detail | `lib/admin.ts`, `app/admin/page.tsx` |
| The audit log is read, not only written: the console flags failed-attempt bursts, a success that followed them, rate limiting, uninvited addresses and ids no longer in the database | `lib/security-signals.ts` |
| Loopback traffic is treated as local development rather than as an incident, and stated as such — the dev server shares the production database, so testing would otherwise raise real alerts | `lib/security-signals.ts` |
| Google sign-in as an identity provider only, invite-only: proving who someone is does not create an account | `lib/oauth.ts` |
| Sign-up claims an invitation, never creates one: the address must already exist as an unused invite (no password, never linked to Google, never signed in); every refusal returns the same message; the claim is a conditional update so it cannot land twice; the same brute-force ceilings as sign-in | `lib/signup.ts`, `app/api/auth/signup/route.ts` |
| `email_verified`, `aud`, `iss` and `exp` all checked on the id_token | `lib/oauth.ts` |
| OAuth `state` in a short-lived httpOnly cookie, compared in constant time, plus PKCE | `lib/oauth.ts` |

### CC6.6 / CC6.7 — Boundary and transmission

- CSP permitting **no external origin at all**. `connect-src 'self'` means that
  even if something coaxed a malicious URL out of the model, the browser has
  nowhere to send anything.
- Outbound data flows are enumerated: the model call to Anthropic (her
  conversation and the state block); — only when `INSTACART_API_KEY` is set
  and only when she asks — the week's shopping list to Instacart's API, which is
  item names and quantities and nothing about her; and — only when she turns on
  a reminder — a **bare push** to whichever push service her browser named
  (Apple's, Google's, Mozilla's). That last one carries **no payload at all**:
  a signed VAPID header proving the sender, and nothing else. The words "time
  to weigh in" live in the service worker, so the push service is told to wake
  a device and is told nothing about her. `lib/push.ts` has no dependency in
  the path — `node:crypto` signs it — and a 404 or 410 deletes the
  subscription rather than retrying it for ever.
  All are server-side calls; the browser talks to no one but this app and its
  own push service.
- Links in coach output render only for the `https:` scheme
  (`components/rich-text.tsx`), and open in a new tab with `noopener`.
- HSTS with a two-year max-age, `frame-ancestors 'none'`, `nosniff`,
  `no-referrer`, restrictive `Permissions-Policy`, framework version header off.
- TLS in transit (Vercel); database connections require `sslmode`.
- `noindex` plus a disallow-all `robots.txt`.

### CC7.1 — Vulnerability management

- `npm audit --omit=dev --audit-level=high` fails CI.
- Dev-only advisories reported without blocking.
- Runs weekly on a schedule as well as per push, because dependencies rot even
  when the code does not.

### CC7.2 / CC7.3 — Monitoring and event detection

- `audit_log` records authentication success and failure, rate-limiting,
  sign-out, budget changes, spend-ceiling hits, every export, restore or
  deletion of her data, and every time her data is handed to a third party at
  her request — currently the shopping list to Instacart (`lib/audit.ts`).
- Deletion is now something she can do herself, through the coach or the
  screens: sets, sessions, weigh-ins, measurements, meals, milestones, photos,
  the kitchen, a date range, and the conversation itself. Every one of those
  paths calls `audit("data.deleted")` with a count and a scope — never with
  what was removed.
- Deliberately narrow: **no credentials, and no record of passphrase attempts
  even hashed** — a log of near-misses is a wordlist. No body or training data.
- Append-only by convention, and it survives `db:reset`.
- Application errors are logged server-side; clients receive generic messages,
  because stack traces and database errors are reconnaissance.

### CC7.5 / A1.2 — Recovery

- `npm run backup` / `npm run restore`, **verified by an actual round trip** —
  backed up, wiped, restored, every table count matched.
- `db:reset` refuses to run without `--yes` and points at the backup first.

**Service worker.** `public/sw.js` intercepts same-origin GETs. It is scoped
to content-hashed build output only: documents, RSC payloads and `/api`
responses go straight to the network, so no account data is ever written to
the cache. `/sw.js`, `/icon-192` and `/icon-512` are in `PUBLIC_PATHS` — static
generated assets holding nothing of hers, the same category as the icons
already there.

### CC8.1 — Change management

- All changes through git; CI runs typecheck, lint, 541 tests, dependency audit
  and a production build on every push to main.
- Deploy is a CI job gated on every other job passing. Production cannot be
  reached from a workstation state that CI has not seen: a red typecheck,
  lint, test, audit, build or credential scan means the deploy job never
  starts and the last good build keeps serving.
- The deploy token lives only in the repository secret and is referenced only
  by the deploy job, which runs on pushes to main. The repository is public,
  so this matters: a fork's pull request cannot satisfy that condition and
  therefore cannot reach the token.
- The build step proves nothing reaches for a secret at module load.
- History scanned for credential-shaped strings; `.env` asserted gitignored and
  `.env.example` asserted tracked.
- Structural tests enforce architectural invariants that would otherwise decay
  (`tests/tool-coverage.test.ts`), and each is verified to fail when violated.

### Health data she volunteers

Beyond weight, measurements and food, the app stores what she reports as
hurting (`complaints`: a body region in her own words, a 0-10 severity, and the
movement that provoked it) and, if she chooses to log it, her cycle
(`cycle_events`: period start and end, and symptoms in her words). Both exist
for narrow, stated purposes and are used for those only — the complaint log so
the plan stops prescribing the thing that aggravates it, the cycle log so a
fluid rise on the scale is explained rather than reported as a gain, and so she
can decide to move a session.

A body-fat estimate is derived from her tape measurements (US Navy
circumference method) for one purpose: the lowest intake she can safely be set
is computed from her lean mass rather than from a formula, and
`set_nutrition_targets` enforces that floor where no prompt can reach it. The
estimate is stated with its uncertainty — about four percentage points — and
the coach is instructed to lead with the change over months rather than the
level, because the level is mostly noise and is exactly the kind of figure
someone watches daily.

The cycle data is the most sensitive thing in this database after the progress
photos. It is never used to prescribe training by phase — that is ahead of the
evidence — and the coach is instructed never to raise the subject unless she
does.

- It never leaves the server except to Anthropic, in the same channel as the
  rest of the coaching context, and never to Instacart.
- It is not diagnostic and the app does not treat it as such: severity 7+, or
  anything open for a fortnight, produces one response — see a
  physiotherapist — and the app generates no rehabilitation programme.
- It is in the backup set and in the cascade behind account deletion.

### Cost controls, per person

Spend ceilings, chat rate limits and login attempt limits are all scoped per
account, so one person cannot exhaust another's budget or lock them out. Login
attempts are additionally capped globally, because `x-forwarded-for` is
client-supplied and a per-IP limit alone can be rotated around.

Spend that fails to be attributed to anyone is counted against the ceiling
regardless — spend charged to nobody would otherwise have no limit at all, which
is the single thing the cap exists to prevent.

### CC5 / PI1 — Processing integrity

- Every tool input validated with Zod before any handler runs.
- Idempotency keys on set and meal logging, so a lost response cannot
  double-record — and, for a planned meal, cannot empty the kitchen twice.
- **Unknown is carried, not zeroed.** A meal logged in words has no calorie
  figure and a day containing one is reported as a floor, never a total; a
  fortnight that is mostly uncounted is refused rather than averaged. The
  adaptive calorie engine will not lower a target from thin data, and will not
  go below her resting expenditure whatever it is asked for
  (`lib/expenditure.ts`).
- Every mutation goes through the tool registry, asserted by
  `tests/invariants.test.ts` — `app/api/onboard` was the last exception and no
  longer is.
- Dates computed in her timezone, not the server's.
- Spend ceiling enforced *before* any model call, with real token usage recorded
  from every response — including each iteration of a tool loop.
- Behavioural evals assert the coach reads data before making claims about it.

### C1 — Confidentiality

- Secrets only in environment variables, read only in server code, never shipped
  to the browser.
- `.env*` gitignored with an explicit exception for the example file.
- Backups contain personal data and are gitignored.

### P — Privacy (partial)

- Data export and deletion both exist and are tested.
- Each account has its own profile; one account cannot read another's data.
  The subject is inside the signed session payload, so a token cannot be
  re-pointed at a different account.
- Two structural tests keep it that way: a tool whose input names a row id must
  consult `ctx.profileId`, and no tool may update or delete by an input id
  without a profile scope in the same statement. `npm run tenancy` then proves
  it against a real database with two throwaway accounts.

---

## Not implemented

Listed plainly, because a readiness document that only lists strengths is
marketing.

**Organisational — all of CC1, CC2, CC3, CC9.** No entity, no policies, no
personnel screening, no security training, no risk register, no board oversight,
no vendor management for the subprocessors this app depends on (Vercel, Neon,
Anthropic, GitHub, and Instacart when connected). This is the largest gap and
no code closes it.

**No independent audit.** Nothing here has been reviewed by anyone but its
author and its author's tooling.

**Authentication.** No MFA, and no second factor of any kind — a stolen
password, or a compromised Google account, is full access. No password rotation policy, no account lockout beyond
rate limiting, and no self-service password reset (an owner runs
`npm run user -- passwd`). Revocation is per account, not per device: signing out
everywhere ends every session that account holds, including the one asking.

**Segregation of duties.** Solo developer with production access. No peer
review and no privileged-access management. Deploy approval is mechanical,
not human: CI gates it, but the same person writes the code and holds the
token, and manual `vercel deploy` from a workstation is still possible.

**Alerting.** Partly closed. The owner console reads the log and flags what is
worth a second look — a sign-in that followed a run of guesses from the same
address, bursts of failures, the rate limiter firing, uninvited addresses,
attempts to claim an account already in use, attempts on a disabled account,
Google callbacks that did not match the browser that started them, and
activity recorded against an account id the database no longer has
(`lib/security-signals.ts`). **Nothing pushes.** It is seen when someone opens
the console, so a brute-force attempt at 3am is recorded and waits to be
noticed rather than waking anybody.

**Formal incident response.** No documented severity levels, notification
timelines, or post-incident review process.

**Retention.** No defined retention schedule and no automatic deletion. Data is
kept until someone deletes it.

**Availability commitments.** No SLA, no uptime monitoring, no tested disaster
recovery beyond the backup script, no RTO/RPO.

**Encryption at rest** is whatever Neon provides by default; not independently
verified or configured.

**Logging durability.** Audit records live in the same database they describe.
An attacker with database access could edit them.

---

## If this ever needed a real attestation

Roughly in order: form the entity and write the policies; adopt a compliance
platform for evidence collection; implement real identity with MFA; add
monitoring and alerting on the audit log; document incident response and
actually rehearse it; execute vendor agreements and collect subprocessor SOC 2
reports; define retention; establish access reviews; then engage a CPA firm for
a readiness assessment, and only then a Type I, and after an observation window,
a Type II.

The engineering here would be a modest part of that. The organisational work is
the bulk of it.

---

## Standing rules for new work

These keep the implemented set from decaying:

1. **New route, new gate.** `middleware.ts` denies by default. Adding to
   `PUBLIC_PATHS` exposes something publicly — treat it as a deliberate decision
   with a stated reason.
2. **Security-relevant events get audited.** Anything touching authentication,
   authorisation, spend limits, or the movement or deletion of her data calls
   `audit()`. Never log a credential, a passphrase attempt, or her body data.
3. **Validate at the boundary.** Every tool input parses through Zod before the
   handler runs. Client-supplied identifiers are never trusted for scoping.
4. **Errors are generic to the client, specific in the log.**
5. **Secrets stay in the environment.** Nothing reaches for a credential at
   module load; CI's build step exists to catch that.
6. **CI must pass before deploy.** Enforced, not merely intended: deploy is a
   CI job that needs every other job. It is the only automated review this
   project has. Deploying by hand bypasses it — and uploads the working
   directory, untracked files included, which is how a half-written file
   once reached a production build.
7. **Back up before anything destructive.** Migrations included.
8. **If a control is removed, remove it from this document too.** A stale
   readiness document is worse than none, because it is believed.
