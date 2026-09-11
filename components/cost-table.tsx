import { money, PER_ACTIVE_DAY_MICROS, PER_REQUEST_MICROS } from "@/lib/infra-cost";
import type { CostsByWindow } from "@/lib/admin-costs";

const WINDOWS = [
  ["today", "Today"],
  ["week", "7 days"],
  ["month", "30 days"],
  ["year", "Year"],
] as const;

/**
 * What each person costs, over four windows.
 *
 * Two kinds of number sit next to each other and the table has to keep saying
 * which is which: **coach spend is measured** to the micro from every
 * response's usage block, and **infrastructure is estimated** because the
 * platform bills the deployment rather than the account. They are never added
 * into a single figure without the word "est." on it, and the assumptions are
 * printed under the table rather than left in a file nobody opens.
 *
 * Scrolls inside its own box: a wide table must never make the page scroll
 * sideways.
 */
export function CostTable({
  costs, people,
}: {
  costs: CostsByWindow;
  /** Profile id to a name worth reading. */
  people: { profileId: string; label: string }[];
}) {
  const ranked = [...people].sort((a, b) =>
    (costs.month.rows.get(b.profileId)?.totalMicros ?? 0)
    - (costs.month.rows.get(a.profileId)?.totalMicros ?? 0));

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[15px] font-semibold">What it costs</h2>
        <p className="text-[12px] text-faint">coach measured · infra estimated</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-faint">
              <th className="py-2 pr-3 font-medium">Person</th>
              {WINDOWS.map(([, label]) => (
                <th key={label} className="py-2 pr-3 text-right font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ profileId, label }) => (
              <tr key={profileId} className="border-t border-line/60 align-top">
                <td className="py-2.5 pr-3">
                  <span className="block truncate font-medium">{label}</span>
                </td>
                {WINDOWS.map(([key]) => {
                  const row = costs[key].rows.get(profileId);
                  return (
                    <td key={key} className="py-2.5 pr-3 text-right tabular">
                      <span className="block font-semibold">
                        {money((row?.coachMicros ?? 0) + (row?.infraMicros ?? 0))}
                      </span>
                      {/* Broken out, because one of the two is a measurement
                          and the other is arithmetic over assumptions. */}
                      <span className="block whitespace-nowrap text-[11px] text-faint">
                        {money(row?.coachMicros ?? 0)} + {money(row?.infraMicros ?? 0)} est.
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-line">
              <td className="py-2.5 pr-3 text-[11px] uppercase tracking-widest text-faint">Everyone</td>
              {WINDOWS.map(([key]) => (
                <td key={key} className="py-2.5 pr-3 text-right tabular">
                  <span className="block font-semibold">{money(costs[key].totals.totalMicros)}</span>
                  <span className="block whitespace-nowrap text-[11px] text-faint">
                    {money(costs[key].totals.coachMicros)} + {money(costs[key].totals.infraMicros)} est.
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/*
        The assumptions, on the screen rather than in a file nobody opens.
        An estimate whose workings are invisible gets believed like a
        measurement, which is the whole failure this note exists to prevent.
      */}
      <p className="mt-3 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-faint">
        Coach spend is measured from each response&rsquo;s usage. Infrastructure is an estimate:
        about {money(PER_REQUEST_MICROS)} per coach request and {money(PER_ACTIVE_DAY_MICROS)} per
        day somebody used the app at all. Nothing here meters one person&rsquo;s function seconds —
        the platform bills the deployment, not the account — so treat it as the right order of
        magnitude and not as a reconciliation.
      </p>
    </section>
  );
}
