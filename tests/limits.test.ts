import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PRICING } from "@/lib/agent/model";
import { LIMITS, clientIp, costMicros } from "@/lib/limits";

/**
 * The expected costs below are hand-computed from the published Haiku 4.5
 * prices, deliberately not from PRICING, so that a pricing change has to be
 * made twice: once in the code and once here. `PRICING` is the spend cap's
 * only calibration — if MODEL changes and PRICING does not, the daily ceiling
 * silently guards the wrong number.
 */
const USD_PER_MILLION = { input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1 };

const ENV_KEYS = [
  "DAILY_COST_LIMIT_MICROS",
  "MAX_CHAT_PER_DAY",
  "MAX_CHAT_PER_MINUTE",
  "MAX_LOGIN_ATTEMPTS_PER_HOUR",
  "MAX_LOGIN_ATTEMPTS_PER_HOUR_GLOBAL",
  "MAX_MESSAGE_CHARS",
] as const;

const saved = new Map<string, string | undefined>();
const setEnv = (key: string, value: string | undefined) => {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe("PRICING", () => {
  it("still matches the prices the cost arithmetic below assumes", () => {
    expect(PRICING).toEqual(USD_PER_MILLION);
  });
});

describe("costMicros", () => {
  const cases: [name: string, usage: Parameters<typeof costMicros>[0], expected: number][] = [
    // One million tokens of each kind, so the price per million reads directly.
    ["1M input tokens costs $1.00", { input_tokens: 1_000_000 }, 1_000_000],
    ["1M output tokens costs $5.00", { output_tokens: 1_000_000 }, 5_000_000],
    ["1M cache reads costs $0.10", { cache_read_input_tokens: 1_000_000 }, 100_000],
    ["1M cache writes costs $1.25", { cache_creation_input_tokens: 1_000_000 }, 1_250_000],

    // Everyday magnitudes.
    ["1k input tokens", { input_tokens: 1_000 }, 1_000],
    ["200 output tokens", { output_tokens: 200 }, 1_000],
    ["5k cache reads", { cache_read_input_tokens: 5_000 }, 500],
    ["800 cache writes", { cache_creation_input_tokens: 800 }, 1_000],

    // Combinations: 1200*1 + 350*5 + 18000*0.1 + 4400*1.25
    [
      "a full cached turn",
      {
        input_tokens: 1_200,
        output_tokens: 350,
        cache_read_input_tokens: 18_000,
        cache_creation_input_tokens: 4_400,
      },
      1_200 + 1_750 + 1_800 + 5_500,
    ],
    [
      "a cold turn that writes the cache",
      { input_tokens: 900, output_tokens: 1_100, cache_creation_input_tokens: 12_000 },
      900 + 5_500 + 15_000,
    ],

    // Absent, null and zero fields.
    ["no usage at all", {}, 0],
    ["all zeroes", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, 0],
    [
      "all nulls",
      { input_tokens: null, output_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null },
      0,
    ],
    ["nulls mixed with real numbers", { input_tokens: 2_000, output_tokens: null }, 2_000],
    ["undefined mixed with real numbers", { output_tokens: 400, cache_read_input_tokens: undefined }, 2_000],

    // Rounding to whole micros.
    ["4 cache reads round down to 0", { cache_read_input_tokens: 4 }, 0],
    ["5 cache reads round up to 1", { cache_read_input_tokens: 5 }, 1],
    ["15 cache reads round to 2", { cache_read_input_tokens: 15 }, 2],
    ["a fractional total rounds once, at the end", { input_tokens: 3, cache_read_input_tokens: 4 }, 3],
  ];

  for (const [name, usage, expected] of cases) {
    it(name, () => {
      expect(costMicros(usage)).toBe(expected);
    });
  }

  it("always returns a whole number of micros", () => {
    for (let i = 1; i <= 50; i++) {
      expect(Number.isInteger(costMicros({ cache_read_input_tokens: i, input_tokens: i * 7 }))).toBe(true);
    }
  });

  it("never decreases when tokens are added", () => {
    const base = { input_tokens: 1_000, output_tokens: 100 };
    expect(costMicros({ ...base, output_tokens: 101 })).toBeGreaterThan(costMicros(base));
    expect(costMicros({ ...base, cache_read_input_tokens: 10_000 })).toBeGreaterThan(costMicros(base));
    expect(costMicros({ ...base, cache_creation_input_tokens: 10 })).toBeGreaterThan(costMicros(base));
  });

  it("prices output above input, and a cache read far below both", () => {
    const n = 10_000;
    expect(costMicros({ output_tokens: n })).toBeGreaterThan(costMicros({ input_tokens: n }));
    expect(costMicros({ input_tokens: n })).toBeGreaterThan(costMicros({ cache_creation_input_tokens: n }) / 2);
    expect(costMicros({ cache_read_input_tokens: n })).toBeLessThan(costMicros({ input_tokens: n }));
  });

  it("keeps the default daily ceiling in a sane range for real turns", () => {
    // ~150 turns of a 20k-token cached context before the $0.50 cap trips.
    const turn = costMicros({
      input_tokens: 500,
      output_tokens: 400,
      cache_read_input_tokens: 20_000,
    });
    expect(turn).toBe(500 + 2_000 + 2_000);
    expect(Math.floor(500_000 / turn)).toBeGreaterThan(50);
  });
});

describe("LIMITS", () => {
  const getters: [key: keyof typeof LIMITS, envVar: (typeof ENV_KEYS)[number], fallback: number][] = [
    ["dailyCostMicros", "DAILY_COST_LIMIT_MICROS", 500_000],
    ["chatPerDay", "MAX_CHAT_PER_DAY", 250],
    ["chatPerMinute", "MAX_CHAT_PER_MINUTE", 8],
    ["loginAttemptsPerHour", "MAX_LOGIN_ATTEMPTS_PER_HOUR", 10],
    ["loginAttemptsPerHourGlobal", "MAX_LOGIN_ATTEMPTS_PER_HOUR_GLOBAL", 200],
    ["maxMessageChars", "MAX_MESSAGE_CHARS", 4_000],
  ];

  for (const [key, envVar, fallback] of getters) {
    describe(`${key} (${envVar})`, () => {
      it(`falls back to ${fallback} when unset`, () => {
        setEnv(envVar, undefined);
        expect(LIMITS[key]).toBe(fallback);
      });

      it("reads a plain number", () => {
        setEnv(envVar, "1234");
        expect(LIMITS[key]).toBe(1234);
      });

      it("accepts an explicit zero", () => {
        setEnv(envVar, "0");
        expect(LIMITS[key]).toBe(0);
      });

      it("falls back on a non-numeric value", () => {
        setEnv(envVar, "eight");
        expect(LIMITS[key]).toBe(fallback);
      });

      it("falls back on a partially numeric value", () => {
        setEnv(envVar, "12tokens");
        expect(LIMITS[key]).toBe(fallback);
      });

      it("falls back on a negative value", () => {
        setEnv(envVar, "-1");
        expect(LIMITS[key]).toBe(fallback);
      });

      it("falls back on Infinity", () => {
        setEnv(envVar, "Infinity");
        expect(LIMITS[key]).toBe(fallback);
      });

      it("treats an empty or blank value as unset, not as zero", () => {
        // Regression: Number("") is 0, which is finite and >= 0, so the
        // fallback used to be skipped. A blank value in a hosting dashboard
        // would pin the limit at zero and disable the coach entirely.
        setEnv(envVar, "");
        expect(LIMITS[key]).toBe(fallback);
        setEnv(envVar, "   ");
        expect(LIMITS[key]).toBe(fallback);
      });
    });
  }

  it("re-reads the environment on every access rather than caching at import", () => {
    setEnv("MAX_CHAT_PER_MINUTE", "3");
    expect(LIMITS.chatPerMinute).toBe(3);
    setEnv("MAX_CHAT_PER_MINUTE", "9");
    expect(LIMITS.chatPerMinute).toBe(9);
    setEnv("MAX_CHAT_PER_MINUTE", undefined);
    expect(LIMITS.chatPerMinute).toBe(8);
  });

  it("accepts the numeric spellings a config file might use", () => {
    setEnv("DAILY_COST_LIMIT_MICROS", "1e6");
    expect(LIMITS.dailyCostMicros).toBe(1_000_000);
    setEnv("DAILY_COST_LIMIT_MICROS", " 250000 ");
    expect(LIMITS.dailyCostMicros).toBe(250_000);
    setEnv("DAILY_COST_LIMIT_MICROS", "250000.5");
    expect(LIMITS.dailyCostMicros).toBe(250_000.5);
  });

  it("keeps the per-minute allowance below the per-day one by default", () => {
    for (const key of ENV_KEYS) setEnv(key, undefined);
    expect(LIMITS.chatPerMinute).toBeLessThan(LIMITS.chatPerDay);
    expect(LIMITS.loginAttemptsPerHour).toBeLessThan(LIMITS.loginAttemptsPerHourGlobal);
    expect(LIMITS.dailyCostMicros).toBe(500_000); // $0.50/day
  });
});

describe("the action route has a ceiling of its own", () => {
  // /api/action reaches every registered tool, so it had the same reach as the
  // chat route and none of its limits.
  it("bounds direct tool calls per minute", () => {
    expect(LIMITS.actionsPerMinute).toBeGreaterThan(0);
  });

  // These are taps — logging a set between reps, stepping a weight. The limit
  // exists to bound a runaway client, not to pace her, so it must sit well
  // above anything a person does by hand.
  it("sets it far above human tapping speed", () => {
    expect(LIMITS.actionsPerMinute).toBeGreaterThanOrEqual(60);
  });

  it("reads it from the environment like every other limit", () => {
    const prev = process.env.MAX_ACTIONS_PER_MINUTE;
    process.env.MAX_ACTIONS_PER_MINUTE = "40";
    expect(LIMITS.actionsPerMinute).toBe(40);
    // An empty variable must not read as zero — that would pin the ceiling
    // shut, the bug already fixed once for the daily cost limit.
    process.env.MAX_ACTIONS_PER_MINUTE = "";
    expect(LIMITS.actionsPerMinute).toBe(120);
    if (prev === undefined) delete process.env.MAX_ACTIONS_PER_MINUTE;
    else process.env.MAX_ACTIONS_PER_MINUTE = prev;
  });
});

describe("identifying the caller for rate limiting", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.test/api/login", { headers });

  it("prefers x-real-ip, which the platform sets", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to the first hop of x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  // Everything unidentifiable shares one bucket. That is the safe direction:
  // they collectively hit the login ceiling rather than each getting a fresh
  // allowance, which is what an attacker stripping the header would want.
  it("buckets anything it cannot identify together", () => {
    expect(clientIp(req({}))).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientIp(req({ "x-real-ip": "   " }))).toBe("unknown");
  });

  it("bounds the length so a huge header cannot bloat the bucket key", () => {
    const long = "9".repeat(5000);
    expect(clientIp(req({ "x-real-ip": long }).valueOf() as Request).length).toBeLessThanOrEqual(45);
  });
});

/**
 * Spend that vanishes from the ledger is worse than spend that is merely
 * unattributed: `todaySpend` reads the ledger, and the daily cap is computed
 * from what it finds.
 */
describe("eval spend belongs to nobody, on purpose", () => {
  it("is recorded unattributed, so deleting the probe profile cannot erase it", () => {
    // The eval harness creates a throwaway profile and deletes it at the end.
    // usage_daily.profileId cascades, so attributing eval usage to that profile
    // meant the row went with it — the run reported $0.0000 for a run that had
    // just spent real money.
    const src = fs.readFileSync("lib/limits.ts", "utf8");
    expect(src).toMatch(/source === "eval" \? null : profileId/);
  });
});
