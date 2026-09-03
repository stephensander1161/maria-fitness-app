import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAY_NAMES,
  addDays,
  dayIndex,
  daysBetween,
  greetingFor,
  hourIn,
  isFuture,
  prettyDate,
  today,
  toISODate,
  weekStart,
} from "@/lib/date";

/** Mon 2026-08-24 … Sun 2026-08-30, then the next Monday. */
const WEEK: [date: string, name: (typeof DAY_NAMES)[number], index: number][] = [
  ["2026-08-24", "Monday", 0],
  ["2026-08-25", "Tuesday", 1],
  ["2026-08-26", "Wednesday", 2],
  ["2026-08-27", "Thursday", 3],
  ["2026-08-28", "Friday", 4],
  ["2026-08-29", "Saturday", 5],
  ["2026-08-30", "Sunday", 6],
];

afterEach(() => {
  vi.useRealTimers();
});

describe("toISODate", () => {
  it("zero-pads month and day", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("formats in her timezone, not the server's", () => {
    // The bug this replaces: Vercel runs UTC, so a 7:30pm Mountain workout was
    // recorded against the following day, every evening.
    const evening = new Date("2026-08-31T19:30:00-06:00");
    expect(toISODate(evening, "America/Edmonton")).toBe("2026-08-31");
    expect(toISODate(evening, "UTC")).toBe("2026-09-01");

    // And the other direction, east of Greenwich.
    const earlyMorning = new Date("2026-08-31T08:30:00+09:00");
    expect(toISODate(earlyMorning, "Asia/Tokyo")).toBe("2026-08-31");
    expect(toISODate(earlyMorning, "UTC")).toBe("2026-08-30");
  });
});

describe("weekStart", () => {
  for (const [date, name] of WEEK) {
    it(`${name} ${date} belongs to the week starting Monday 2026-08-24`, () => {
      expect(weekStart(date)).toBe("2026-08-24");
    });
  }

  it("does not roll Sunday forward into the next week", () => {
    // The classic off-by-one: getDay() calls Sunday 0, so a naive
    // implementation would return the *following* Monday here.
    expect(weekStart("2026-08-30")).toBe("2026-08-24");
    expect(weekStart("2026-08-31")).toBe("2026-08-31"); // the next Monday
  });

  it("is idempotent", () => {
    for (const [date] of WEEK) {
      expect(weekStart(weekStart(date))).toBe(weekStart(date));
    }
  });

  it("steps back across a month boundary", () => {
    expect(weekStart("2026-03-01")).toBe("2026-02-23"); // Sun 1 Mar -> Mon 23 Feb
    expect(weekStart("2026-09-01")).toBe("2026-08-31");
  });

  it("steps back across a year boundary", () => {
    expect(weekStart("2026-01-01")).toBe("2025-12-29"); // Thu 1 Jan -> Mon 29 Dec
    expect(weekStart("2027-01-03")).toBe("2026-12-28"); // Sun 3 Jan -> Mon 28 Dec
  });

  it("steps back across a spring-forward DST boundary", () => {
    expect(weekStart("2026-03-14")).toBe("2026-03-09"); // spans US 8 Mar
    expect(weekStart("2026-04-04")).toBe("2026-03-30"); // spans EU 29 Mar and AU 5 Apr
  });

  it("defaults to today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // An explicit UTC instant: Sunday evening. Constructing with local calendar
    // fields would make this assertion depend on the machine running it.
    vi.setSystemTime(new Date("2026-08-30T22:45:00Z"));
    expect(weekStart()).toBe("2026-08-24");
  });

  it("always returns a Monday", () => {
    let d = "2025-11-01";
    for (let i = 0; i < 400; i++) {
      expect(dayIndex(weekStart(d))).toBe(0);
      d = addDays(d, 1);
    }
  });
});

describe("dayIndex", () => {
  for (const [date, name, index] of WEEK) {
    it(`${date} is ${name} = ${index}`, () => {
      expect(dayIndex(date)).toBe(index);
      expect(DAY_NAMES[dayIndex(date)]).toBe(name);
    });
  }

  it("maps Sunday to 6, not 0", () => {
    expect(dayIndex("2026-08-30")).toBe(6);
  });

  it("agrees with the offset from the week start", () => {
    let d = "2026-01-01";
    for (let i = 0; i < 400; i++) {
      expect(daysBetween(weekStart(d), d)).toBe(dayIndex(d));
      d = addDays(d, 1);
    }
  });

  it("defaults to today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 30, 1, 15)); // Sunday, just after midnight
    expect(dayIndex()).toBe(6);
    expect(today()).toBe("2026-08-30");
  });
});

describe("addDays", () => {
  const cases: [from: string, days: number, expected: string][] = [
    ["2026-08-24", 0, "2026-08-24"],
    ["2026-08-24", 1, "2026-08-25"],
    ["2026-08-24", -1, "2026-08-23"],
    ["2026-08-24", 7, "2026-08-31"],
    ["2026-08-24", -7, "2026-08-17"],
    // Month boundaries
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-02-01", -1, "2026-01-31"],
    ["2026-04-30", 1, "2026-05-01"],
    ["2026-05-31", 1, "2026-06-01"],
    // February, common and leap
    ["2026-02-28", 1, "2026-03-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2100-02-28", 1, "2100-03-01"], // 2100 is not a leap year
    // Year boundaries
    ["2025-12-31", 1, "2026-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-12-31", 7, "2027-01-07"],
    ["2026-01-01", -7, "2025-12-25"],
    ["2026-01-01", 365, "2027-01-01"],
    ["2024-01-01", 366, "2025-01-01"], // leap year
    // DST transitions — noon anchoring must absorb the ±1h shift
    ["2026-03-07", 1, "2026-03-08"], // US spring forward
    ["2026-03-08", 1, "2026-03-09"],
    ["2026-03-09", -1, "2026-03-08"],
    ["2026-11-01", 1, "2026-11-02"], // US fall back
    ["2026-11-01", -1, "2026-10-31"],
    ["2026-03-28", 1, "2026-03-29"], // EU spring forward
    ["2026-10-25", 1, "2026-10-26"], // EU fall back
    ["2026-04-05", 1, "2026-04-06"], // AU/NZ autumn transition
    ["2026-10-04", 1, "2026-10-05"], // AU spring transition
    ["2026-03-01", 30, "2026-03-31"], // a whole month spanning a transition
    ["2026-11-15", -30, "2026-10-16"],
  ];

  for (const [from, days, expected] of cases) {
    it(`${from} ${days >= 0 ? "+" : ""}${days} = ${expected}`, () => {
      expect(addDays(from, days)).toBe(expected);
    });
  }

  it("is reversible across every DST transition of the year", () => {
    let d = "2026-01-01";
    for (let i = 0; i < 400; i++) {
      expect(addDays(addDays(d, 1), -1)).toBe(d);
      expect(addDays(addDays(d, 30), -30)).toBe(d);
      d = addDays(d, 1);
    }
  });

  it("advances exactly one calendar day at a time over a full year", () => {
    let d = "2026-01-01";
    for (let i = 0; i < 365; i++) d = addDays(d, 1);
    expect(d).toBe("2027-01-01");
  });
});

describe("daysBetween", () => {
  const cases: [a: string, b: string, expected: number][] = [
    ["2026-08-24", "2026-08-24", 0],
    ["2026-08-24", "2026-08-25", 1], // later second argument is positive
    ["2026-08-25", "2026-08-24", -1], // earlier second argument is negative
    ["2026-08-24", "2026-08-31", 7],
    ["2026-01-01", "2027-01-01", 365],
    ["2024-01-01", "2025-01-01", 366],
    ["2027-01-01", "2026-01-01", -365],
    ["2026-01-31", "2026-02-01", 1],
    ["2025-12-31", "2026-01-01", 1],
    // Across DST, where a naive ms/86400000 would give 0.958 or 1.042
    ["2026-03-07", "2026-03-09", 2],
    ["2026-03-08", "2026-03-09", 1],
    ["2026-11-01", "2026-11-02", 1],
    ["2026-03-29", "2026-03-30", 1],
    ["2026-01-01", "2026-12-31", 364],
  ];

  for (const [a, b, expected] of cases) {
    it(`${a} -> ${b} is ${expected} days`, () => {
      expect(daysBetween(a, b)).toBe(expected);
    });
  }

  it("is antisymmetric", () => {
    // Written as a sum so that the 0 / -0 distinction does not matter.
    for (const [a, b] of cases) expect(daysBetween(a, b) + daysBetween(b, a)).toBe(0);
  });

  it("inverts addDays for every offset in a year", () => {
    const base = "2026-06-15";
    for (let n = -200; n <= 200; n++) {
      expect(daysBetween(base, addDays(base, n))).toBe(n);
    }
  });
});

describe("prettyDate", () => {
  it("renders the day of the month", () => {
    expect(prettyDate("2026-08-30")).toContain("30");
  });

  it("does not slip to the previous day (the UTC-parsing trap)", () => {
    expect(prettyDate("2026-01-01")).not.toContain("31");
  });
});

describe("the future-date guard", () => {
  // It used to compare against the server's date. A user ahead of
  // APP_TIMEZONE could not log anything on their own current day: their today
  // read as the future, and every write was refused.
  it("judges the future against the day she is actually in", () => {
    expect(isFuture("2026-09-02", "2026-09-01")).toBe(true);
    expect(isFuture("2026-09-01", "2026-09-01")).toBe(false);
    expect(isFuture("2026-08-31", "2026-09-01")).toBe(false);
  });

  it("lets someone a day ahead of the server log their own today", () => {
    // Server on the 1st, her on the 2nd in Kiritimati.
    expect(isFuture("2026-09-02", "2026-09-02")).toBe(false);
  });
});


describe("the time of day, where she is", () => {
  it("names the part of the day the way English does", () => {
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(21)).toBe("Good evening");
    // Someone still up at one in the morning would rather be told it is night
    // than be wished a good evening.
    expect(greetingFor(22)).toBe("Good night");
    expect(greetingFor(1)).toBe("Good night");
    expect(greetingFor(4)).toBe("Good night");
  });

  it("covers every hour, so none falls through with nothing to say", () => {
    for (let h = 0; h < 24; h += 1) {
      expect(greetingFor(h), `hour ${h}`).toMatch(/^Good (morning|afternoon|evening|night)$/);
    }
  });

  it("reads the hour in her zone, not the server's", () => {
    // The same instant is a different hour in two places. Greeting someone
    // "good morning" at nine in the evening because the box is in another
    // country is the small version of filing her dinner on the wrong day.
    const a = hourIn("Pacific/Auckland");
    const b = hourIn("America/Los_Angeles");
    for (const h of [a, b]) {
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
    }
    expect(a).not.toBe(b);
  });
});
