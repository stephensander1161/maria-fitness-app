import Link from "next/link";
import { COLLECTED, FRIENDS_SEE, LEGAL, THIRD_PARTIES } from "@/lib/legal";

export const metadata = { title: "Privacy" };

/**
 * The privacy policy, public and readable signed out.
 *
 * Written from lib/legal.ts rather than from a template, because a policy is
 * only worth anything if it is true. The lists on this page are the same ones
 * COMPLIANCE.md enumerates and the schema holds; when the app changes, they
 * change here.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-10 text-[15px] leading-relaxed">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">{LEGAL.appName}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-1 text-[13px] text-muted">Effective {LEGAL.effectiveDate}. Operated by {LEGAL.operator}, {LEGAL.jurisdiction}.</p>

      <P>
        {LEGAL.appName} is a strength and nutrition coach. It holds information about your
        body, your training, your food and your conversations with the coach. This page says
        exactly what that is, where it goes, and how you get it back or make it go away. There
        is no advertising, no analytics, no tracking, and nothing is sold.
      </P>

      <H2>What the app holds about you</H2>
      {COLLECTED.map((c) => (
        <div key={c.group} className="mt-4">
          <h3 className="font-semibold">{c.group}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {c.items.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
      ))}
      <P>
        Everything here is something you entered, logged, or told the coach. The app does not
        read your contacts, your location, your photo library, or anything else on your device.
        A progress photo is only stored if you add it.
      </P>

      <H2>Why</H2>
      <P>
        To be your coach. Your body data sets your targets. Your training log drives your
        plan. Your food log is compared to your targets. Your conversation is what the coach
        remembers. None of it is used for any other purpose, and none of it is used to advertise
        anything to you or anyone else.
      </P>

      <H2>Where it goes</H2>
      <P>Your data leaves the app&apos;s own server in exactly these cases and no others:</P>
      <ul className="mt-2 space-y-3">
        {THIRD_PARTIES.map((t) => (
          <li key={t.name}>
            <span className="font-semibold">{t.name}</span>
            {t.optional && <span className="ml-2 text-[11px] uppercase tracking-wide text-faint">only if you use it</span>}
            <p className="text-muted">{t.what}</p>
          </li>
        ))}
      </ul>

      <H2>Friends</H2>
      <P>
        If you and another person both agree, each of you can see the other&apos;s training and
        only training: {FRIENDS_SEE.join(", ")}. Never weight, measurements, photos, food, or
        anything from the conversation. A request that has not been accepted reveals nothing.
        Either of you can end it at any time.
      </P>

      <H2>The owner</H2>
      <P>
        The person who runs this deployment can see an operational summary: who has an account,
        how each signs in, activity counts, what the coach is costing, and the security log. They
        cannot see your weight, measurements, photos, meals or conversation through the app, and
        the code enforces that. They do hold the database and its backups, which contain
        everything.
      </P>

      <H2>How long</H2>
      <P>
        Until you delete it. Nothing expires on its own. Security log entries are kept so that
        sign-in problems can be investigated. Backups are taken by the owner and contain what the
        database contained at the time.
      </P>

      <H2>Your rights</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li><span className="text-text">See it.</span> Everything is shown in the app. The coach can export your conversation as text on request.</li>
        <li><span className="text-text">Correct it.</span> Everything can be edited or removed, by tapping or by asking the coach.</li>
        <li><span className="text-text">Erase your data</span> and keep your account, from Settings.</li>
        <li><span className="text-text">Delete your account</span> entirely, from Settings. Everything the app holds about you is removed immediately and permanently, including from the coach&apos;s memory. There is no waiting period and no copy to restore from.</li>
        <li><span className="text-text">Ask.</span> Write to {LEGAL.contact} for anything the app cannot do itself.</li>
      </ul>

      <H2>Security</H2>
      <P>
        Passwords are hashed with scrypt. Sessions are signed and cannot be pointed at another
        account. Every account is invited; nobody can sign up uninvited. The only cookie is the
        one that keeps you signed in. The coach cannot reach accounts or credentials at all.
      </P>

      <H2>Age</H2>
      <P>
        {LEGAL.appName} is for adults. It is not directed at anyone under {LEGAL.minimumAge}, and
        no account is knowingly created for a minor.
      </P>

      <H2>Changes</H2>
      <P>
        If what the app collects or where it goes changes, this page changes with it and the
        effective date above moves. This page is generated from the same list the code is checked
        against, so it cannot quietly fall behind.
      </P>

      <p className="mt-10 text-[13px] text-faint">
        <Link href="/terms" className="underline underline-offset-2">Terms of use</Link>
        {" · "}
        <Link href="/login" className="underline underline-offset-2">Sign in</Link>
      </p>
    </article>
  );
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 text-[17px] font-semibold">{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-muted">{children}</p>
);
