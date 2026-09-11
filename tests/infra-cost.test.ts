import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import {
  infraMicros, money, PER_ACTIVE_DAY_MICROS, PER_REQUEST_MICROS, WINDOW_DAYS,
} from "@/lib/infra-cost";

suite("what infrastructure costs, estimated", () => {
  it("charges for the two things that are actually counted", () => {
    // Nothing meters one person's function seconds — the platform bills the
    // deployment, not the account — so the estimate is apportioned from model
    // requests and days somebody used the app at all.
    expect(infraMicros({ requests: 10, activeDays: 0 }, "today", 1))
      .toBe(10 * PER_REQUEST_MICROS);
    expect(infraMicros({ requests: 0, activeDays: 3 }, "week", 1))
      .toBe(3 * PER_ACTIVE_DAY_MICROS);
  });

  it("costs nothing for somebody who did nothing", () => {
    // Three dormant invitees must not look like a cost centre.
    expect(infraMicros({ requests: 0, activeDays: 0 }, "month", 2)).toBe(0);
  });

  it("never divides by nobody", () => {
    // A window in which no account was active would otherwise put Infinity on
    // the owner's console.
    for (const active of [0, -1]) {
      expect(Number.isFinite(infraMicros({ requests: 1, activeDays: 1 }, "year", active))).toBe(true);
    }
  });

  it("covers four windows, in days", () => {
    expect(WINDOW_DAYS).toEqual({ today: 1, week: 7, month: 30, year: 365 });
  });
});

suite("money is written so small numbers survive", () => {
  it("does not round a third of a cent to nothing", () => {
    // Most of these figures are fractions of a cent, and "$0.00" on every row
    // is a table that says nothing. Asserted as a property rather than an
    // exact string: 0.00045 is a hair under a half in binary, so toFixed
    // rounds it down, and pinning the digits would be testing IEEE 754.
    for (const micros of [1, 450, 3_000, 9_999]) {
      expect(money(micros), String(micros)).not.toBe("$0");
      expect(money(micros), String(micros)).not.toBe("$0.00");
    }
    // Nothing is nothing, and says so plainly.
    expect(money(0)).toBe("$0");
  });

  it("uses ordinary money once it is ordinary money", () => {
    expect(money(1_234_567)).toBe("$1.23");
    expect(money(500_000)).toBe("$0.500");
  });
});

suite("the console says which number is which", () => {
  const table = fs.readFileSync("components/cost-table.tsx", "utf8");

  it("never merges a measurement into an estimate silently", () => {
    // Coach spend is exact to the micro; infrastructure is arithmetic over
    // assumptions. A single total with no qualifier gets believed like a bill.
    expect(table).toMatch(/est\./);
    expect(table).toMatch(/coach measured · infra estimated/);
  });

  it("prints its own assumptions", () => {
    // An estimate whose workings are invisible gets believed like a
    // measurement, which is the whole failure the note exists to prevent.
    expect(table).toMatch(/PER_REQUEST_MICROS/);
    expect(table).toMatch(/PER_ACTIVE_DAY_MICROS/);
    expect(table).toMatch(/not as a reconciliation/);
  });

  it("scrolls sideways inside its own box", () => {
    // A wide table must never make the page scroll horizontally.
    expect(table).toMatch(/overflow-x-auto/);
  });
});
