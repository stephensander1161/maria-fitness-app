# App Store readiness

What "App Store compliant" means for this app, honestly split into what is
done, what is yours to do, and what the store would actually say.

## The shape of the thing

Plate is a web app installed from the browser ("Add to Home Screen"). That is
already how the family uses it, it needs no store, no review, no annual fee,
and it updates the moment `npm run ship` finishes. Everything below about
privacy, terms and deletion is worth having regardless of the store, and is
now in place.

Putting it *in* the App Store means wrapping it as a native app (Capacitor is
the usual route), an Apple Developer Program membership (US$99/yr), Xcode on a
Mac, signing, and review. Review guideline 4.2 rejects apps that are "just a
website in a wrapper" unless they offer native value beyond the web version;
a thin wrapper of this app has a real chance of that rejection. Weigh that
before starting.

## Done — in the app now

| Requirement | Where | Guideline |
|---|---|---|
| Privacy policy, public, linked from sign-in, sign-up and Settings | `/privacy`, built from `lib/legal.ts` | 5.1.1(i) |
| Terms of use, with the health disclaimer that the coach is not a clinician | `/terms` | 5.1.1, 1.4.1 |
| In-app account deletion, self-service, immediate, everything cascades | Settings → Delete my account → `app/api/auth/account` | 5.1.1(v) |
| Data the app collects, enumerated and checked against the schema by a test | `lib/legal.ts`, `tests/legal.test.ts` | App Privacy label |
| Every third party her data reaches, enumerated and checked against COMPLIANCE.md | `THIRD_PARTIES` | 5.1.2 |
| No analytics, no tracking, no ads, no data sale — asserted by a test | `tests/legal.test.ts` | 5.1.2, ATT n/a |
| Health data never used for advertising and never sent anywhere but the coach | by construction; see COMPLIANCE.md | 5.1.3 |
| Adults only, stated | `LEGAL.minimumAge` | 1.3 |
| Sign-in: password *and* Google; invite-only | `app/api/login`, `app/api/auth/google` | — |

## Yours to do — needs an Apple account, a decision, or both

1. **Apple Developer Program.** Nothing store-side exists without it.
2. **Sign in with Apple.** Guideline 4.8: an app offering Google sign-in must
   also offer Sign in with Apple (or an equivalent that limits data to name and
   email). This is a hard rule and the most common rejection for exactly this
   setup. It needs a Services ID from the developer account; the code side is
   the same shape as `lib/oauth.ts` and I can build it once the ID exists.
   Alternatively, drop Google sign-in from the store build — password only
   avoids 4.8 entirely.
3. **A native wrapper** (Capacitor), an Xcode project, app icons at every
   size (the mark in `lib/brand.ts` renders them), splash screens, and
   screenshots for each device class.
4. **App Privacy "nutrition label"** in App Store Connect. The answers are in
   `lib/legal.ts`: data *linked to identity* — email, name, health & fitness,
   photos (user-added), messages; *not used for tracking*; *no third-party
   advertising*. Declare Anthropic as a processor.
5. **Age rating** questionnaire. Expect 12+ or 17+ because of medical/treatment
   information and the postpartum content; 4+ is not honest.
6. **Support URL** and marketing URL. The privacy page can serve as both for a
   family app, or a one-line page with the contact address.
7. **Health Kit** — do not integrate it. It adds review scrutiny (5.1.3) and
   the app has no need.
8. **Export compliance** — the app uses only standard HTTPS; answer "no
   proprietary encryption".

## Things a reviewer will try

- Sign up without an invite → refused with a clear message. Reviewers need a
  demo account: create one with `npm run user -- add reviewer@example.com`
  and put the credentials in the review notes. Delete it afterwards.
- Delete the account from inside the app → works, and signs the device out.
- Open the privacy policy from the sign-in screen without an account → works.
- Send the coach something medical → it says to see a professional.

## Privacy law, since it applies with or without a store

The operator is in Alberta, so PIPEDA is the framework. What it asks for and
where it is met: identified purposes (the "Why" section of `/privacy`),
consent (the sign-up screen), limiting collection (nothing collected beyond
what the app uses; asserted by the policy test), safeguards (SECURITY.md),
openness (`/privacy`), individual access (everything is shown in the app; the
transcript exports), and challenging compliance (the contact address).
