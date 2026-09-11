import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { addDays, today, type ISODate } from "@/lib/date";
import { infraMicros, WINDOW_DAYS, type Window } from "@/lib/infra-cost";

/**
 * What each person costs, over four windows.
 *
 * Two different kinds of number sit side by side here and the screen has to
 * keep saying which is which. **Coach spend is measured** — every response's
 * usage block goes into `usage_daily`, and that figure is exact to the micro.
 * **Infrastructure is estimated** — the platform bills the deployment, not the
 * account, so it is apportioned from the two things that are counted. See
 * lib/infra-cost.ts for the rates and what they are worth.
 *
 * Operational, like the rest of `/admin`: how many requests, how many active
 * days, what it cost. Never what anybody ate or lifted.
 *
 * One global day for every boundary, deliberately — this is the deployment's
 * ledger, and it has to bucket the same way `lib/limits.ts` does or the
 * console and the spend gate would disagree about the same day.
 */
export type CostRow = {
  profileId: string;
  /** Measured, exactly. */
  coachMicros: number;
  requests: number;
  /** Days with any activity at all — a coach turn, a set, or a meal. */
  activeDays: number;
  /** Estimated. */
  infraMicros: number;
  totalMicros: number;
};

export type CostsByWindow = Record<Window, {
  rows: Map<string, CostRow>;
  totals: { coachMicros: number; infraMicros: number; totalMicros: number; activeAccounts: number };
}>;

const FROM: Record<Window, (day: ISODate) => ISODate> = {
  today: (d) => d,
  week: (d) => addDays(d, -(WINDOW_DAYS.week - 1)),
  month: (d) => addDays(d, -(WINDOW_DAYS.month - 1)),
  year: (d) => addDays(d, -(WINDOW_DAYS.year - 1)),
};

/**
 * Spend and activity per profile per window, in one pass each.
 *
 * Activity is a union of the three tables that carry a day-level date and
 * belong to a person: coach usage, workouts, meal logs. Counting distinct days
 * across them is what "she used the app" means — a day she logged four sets
 * and never opened the chat is a day the platform served her, and charging her
 * nothing for it would flatter the estimate.
 */
export async function adminCosts(): Promise<CostsByWindow> {
  const day = today();
  const out = {} as CostsByWindow;

  for (const window of Object.keys(FROM) as Window[]) {
    const from = FROM[window](day);

    const rows = await db.execute<{
      profile_id: string; cost_micros: string; requests: string; active_days: string;
    }>(sql`
      with spend as (
        select profile_id,
               sum(cost_micros)::bigint as cost_micros,
               sum(requests)::bigint    as requests
        from usage_daily
        where profile_id is not null and date >= ${from} and date <= ${day}
        group by profile_id
      ),
      -- A day the platform served them, from every table that dates one.
      days as (
        select profile_id, date from usage_daily
          where profile_id is not null and date >= ${from} and date <= ${day}
        union
        select profile_id, date from workouts where date >= ${from} and date <= ${day}
        union
        select profile_id, date from meal_logs where date >= ${from} and date <= ${day}
      ),
      active as (
        select profile_id, count(distinct date)::bigint as active_days
        from days group by profile_id
      )
      select coalesce(spend.profile_id, active.profile_id) as profile_id,
             coalesce(spend.cost_micros, 0) as cost_micros,
             coalesce(spend.requests, 0)    as requests,
             coalesce(active.active_days, 0) as active_days
      from spend full outer join active on active.profile_id = spend.profile_id
    `);

    const list = [...rows];
    // Only people who actually did something share the fixed bill — see
    // lib/infra-cost.ts. Three dormant invitees must not look like a cost.
    const activeAccounts = list.filter((r) => Number(r.active_days) > 0).length;

    const map = new Map<string, CostRow>();
    let coach = 0;
    let infra = 0;
    for (const r of list) {
      if (!r.profile_id) continue;
      const coachMicros = Number(r.cost_micros);
      const requests = Number(r.requests);
      const activeDays = Number(r.active_days);
      const estimated = infraMicros({ requests, activeDays }, window, activeAccounts);
      map.set(r.profile_id, {
        profileId: r.profile_id,
        coachMicros,
        requests,
        activeDays,
        infraMicros: estimated,
        totalMicros: coachMicros + estimated,
      });
      coach += coachMicros;
      infra += estimated;
    }

    out[window] = {
      rows: map,
      totals: { coachMicros: coach, infraMicros: infra, totalMicros: coach + infra, activeAccounts },
    };
  }

  return out;
}
