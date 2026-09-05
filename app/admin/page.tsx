import { adminOverview, money, requireOwner } from "@/lib/admin";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * The owner's console.
 *
 * Operational only. Everything here answers "does this app work for these
 * people, and what is it costing" — accounts, activity counts, spend, and the
 * security log. It carries none of their body or training detail on purpose:
 * an owner who can read another adult's weigh-ins is the failure the friends
 * feature exists to prevent, and there is no consent step here at all.
 *
 * There is no coach panel on this screen, and that is deliberate rather than an
 * omission: no tool exposes any of this, so the coach genuinely cannot answer
 * questions about it, and an "ask about this screen" box would be a promise
 * the app cannot keep.
 */
export default async function AdminPage() {
  const owner = await requireOwner();
  const data = await adminOverview();
  // Reaching other people's records, even in summary, is recorded like any
  // other access to data that is not your own.
  await audit("admin.viewed", { detail: { userId: owner.id, accounts: data.totals.accounts } });

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Accounts, activity and what the coach is costing. Owner only.
        </p>
      </header>

      <div className="space-y-3">
        {/* First, because it is the only thing here that might need doing
            something about. Absence is stated rather than rendered as nothing:
            "nothing to flag" and "the check is broken" must not look alike. */}
        <section className={`card p-5 ${data.signals.some((s) => s.level === "alert") ? "border-miss/50" : ""}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Worth a look</h2>
            <span className="text-[11px] uppercase tracking-widest text-faint">last 30 days</span>
          </div>
          {data.signals.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">
              Nothing to flag. No failed-attempt bursts, no rate limiting, no uninvited
              addresses and no activity from an account the database does not have.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.signals.map((sig, i) => (
                <li key={i} className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                      sig.level === "alert" ? "bg-miss-soft text-miss"
                        : sig.level === "watch" ? "bg-hold-soft text-hold"
                        : "bg-raised text-faint"
                    }`}>
                      {sig.level}
                    </span>
                    <span className="text-[14px] font-medium">{sig.title}</span>
                    <span className="text-[11px] tabular-nums text-faint">{sig.lastAt}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{sig.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
          <Figure label="Accounts" value={String(data.totals.accounts)} />
          <Figure label="Signed in" value={String(data.totals.active30d)} sub="last 30 days" />
          <Figure label="Coach spend" value={money(data.totals.spendTodayMicros)} sub="today" />
          <Figure label="Coach spend" value={money(data.totals.spend30dMicros)} sub="30 days" />
        </section>

        {data.accounts.map((a) => (
          <section key={a.userId} className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold">
                {a.name ?? "No name yet"}
                <span className="ml-2 text-[13px] font-normal text-muted">{a.email}</span>
              </h2>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest">
                <span className="text-faint">{a.role}</span>
                {a.disabled && <span className="text-miss">disabled</span>}
                {!a.onboarded && <span className="text-hold">not set up</span>}
              </div>
            </div>

            <p className="mt-1 text-[12px] text-faint">
              {/* An invitation nobody has claimed has neither door yet, and that
                  is the single most useful thing to see on this screen. */}
              {a.signsInWith.length === 0
                ? "Invited — has not signed in yet"
                : `Signs in with ${a.signsInWith.join(" and ")}`}
              {" · joined "}{a.createdAt}
              {" · last seen "}{a.lastLoginAt ?? "never"}
              {a.timezone ? ` · ${a.timezone}` : ""}
            </p>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <Figure label="Sessions" value={String(a.sessions)} sub={`${a.sessionsLast7} this week`} />
              <Figure label="Sets" value={String(a.setsLogged)} />
              <Figure label="Weigh-ins" value={String(a.weighIns)} />
              <Figure label="Days of food" value={String(a.daysLoggedFood)} />
              <Figure label="Coach messages" value={String(a.coachMessages)} />
              <Figure label="Spend" value={money(a.spend30dMicros)} sub="30 days" />
              {a.openFeedback > 0 && <Figure label="Feedback" value={String(a.openFeedback)} sub="unanswered" />}
            </dl>

            <p className="mt-3 text-[12px] text-faint">
              Last session {a.lastSessionOn ?? "— none logged"}
            </p>
          </section>
        ))}

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Security log</h2>
          <p className="mt-1 text-[13px] text-muted">
            Sign-ins, sign-up attempts, sharing and deletions. Last 25 events.
          </p>
          {data.recentEvents.length === 0 ? (
            <p className="mt-3 text-[13px] text-faint">Nothing recorded in the last 30 days.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-[12px]">
                <thead className="text-faint">
                  <tr>
                    <th className="py-1 pr-3 font-medium">When</th>
                    <th className="py-1 pr-3 font-medium">Event</th>
                    <th className="py-1 pr-3 font-medium">From</th>
                    <th className="py-1 pr-3 font-medium">Where</th>
                    <th className="py-1 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.map((e, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className="py-1.5 pr-3 tabular-nums text-muted">{e.at}</td>
                      <td className={`py-1.5 pr-3 ${e.severity === "warn" ? "text-miss" : "text-text"}`}>{e.event}</td>
                      <td className="py-1.5 pr-3 text-faint">{e.ip ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-faint">
                        {/* Blank locally: a request from this machine has no
                            place worth recording, and "unknown" would imply
                            the lookup failed. */}
                        {e.location ?? "—"}
                      </td>
                      <td className="py-1.5 text-faint">{e.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="text-[20px] font-semibold tabular-nums">
        {value}
        {sub && <span className="ml-1 text-[12px] font-normal text-muted">{sub}</span>}
      </dd>
    </div>
  );
}
