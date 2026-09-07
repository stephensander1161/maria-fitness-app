import { describe as suite, expect, it } from "vitest";
import fs from "node:fs";
import { backupSignal, errorSignals, groupErrors, shapeError } from "@/lib/errors";

const read = (p: string) => fs.readFileSync(p, "utf8");
const now = new Date("2026-09-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

suite("what an error row may carry", () => {
  const cookie = "plate_session=eyJhbGciOi.SECRETSESSIONTOKEN.sig";
  const bearer = "Bearer sk-ant-verysecret";
  const request = {
    path: "/api/chat?debug=1&token=leaky",
    method: "POST",
    headers: { cookie, authorization: bearer, "user-agent": "Safari" },
  };
  const context = { routePath: "/api/chat", routeType: "route" as const };

  it("keeps the route, the method and the message", () => {
    const row = shapeError(new Error("connection refused"), request, context);
    expect(row).toMatchObject({ route: "/api/chat", method: "POST", kind: "route", message: "connection refused" });
    expect(row.stack).toMatch(/connection refused/);
  });

  it("never carries a header, a cookie or a query string", () => {
    // Next hands the hook the whole request. The row is the privacy boundary.
    const row = shapeError(new Error("boom"), request, context);
    const flat = JSON.stringify(row);
    expect(flat).not.toContain("SECRETSESSIONTOKEN");
    expect(flat).not.toContain("sk-ant");
    expect(flat).not.toContain("Safari");
    expect(flat).not.toContain("leaky");
    expect(Object.keys(row).sort()).toEqual(["kind", "message", "method", "route", "stack"]);
  });

  it("falls back to the path, still without the query string", () => {
    const row = shapeError(new Error("x"), request, { routePath: "", routeType: "render" });
    expect(row.route).toBe("/api/chat");
  });

  it("truncates rather than storing a novel", () => {
    const row = shapeError(new Error("m".repeat(10_000)), request, context);
    expect(row.message.length).toBeLessThanOrEqual(500);
    expect(row.stack!.length).toBeLessThanOrEqual(4000);
  });

  it("copes with something that is not an Error", () => {
    const row = shapeError("just a string", request, context);
    expect(row.message).toBe("just a string");
    expect(row.stack).toBeNull();
  });
});

suite("grouping and signalling", () => {
  const row = (route: string, message: string, at: Date, method = "GET") => ({ route, message, at, method, kind: "render" });

  it("groups the same message on the same route and keeps the latest time", () => {
    const groups = groupErrors([
      row("/train", "db down", hoursAgo(5)),
      row("/train", "db down", hoursAgo(1)),
      row("/eat", "db down", hoursAgo(2)),
      row("/train", "other", hoursAgo(30)),
    ]);
    expect(groups.map((g) => [g.route, g.message, g.count])).toEqual([
      ["/train", "db down", 2],
      ["/eat", "db down", 1],
      ["/train", "other", 1],
    ]);
    expect(groups[0].lastAt).toEqual(hoursAgo(1));
  });

  it("raises one watch line for the last day, none for a quiet day", () => {
    const groups = groupErrors([row("/train", "a", hoursAgo(2)), row("/eat", "b", hoursAgo(3)), row("/eat", "b", hoursAgo(3))]);
    const [sig, ...rest] = errorSignals(groups, now);
    expect(rest).toEqual([]);
    expect(sig.level).toBe("watch");
    expect(sig.title).toBe("3 server errors in the last 24 hours");
    expect(sig.detail).toContain("/train");
    expect(sig.detail).toContain("/eat");
    // Older than a day is in the card, not the signal.
    expect(errorSignals(groupErrors([row("/train", "a", hoursAgo(30))]), now)).toEqual([]);
    expect(errorSignals([], now)).toEqual([]);
  });
});

suite("whether the nightly copy is happening", () => {
  const ev = (event: string, at: Date, detail: Record<string, unknown> | null = null) => ({ event, at, detail });

  it("says nothing when last night's was taken", () => {
    expect(backupSignal([ev("backup.taken", hoursAgo(3)), ev("login.success", hoursAgo(1))], now)).toEqual([]);
  });

  it("notes that it has never run, rather than showing nothing", () => {
    const [sig] = backupSignal([ev("login.success", hoursAgo(1))], now);
    expect(sig.level).toBe("note");
    expect(sig.title).toMatch(/has not run yet/);
  });

  it("watches a missed night", () => {
    const [sig] = backupSignal([ev("backup.taken", hoursAgo(50))], now);
    expect(sig.level).toBe("watch");
    expect(sig.title).toMatch(/No backup for 2 days/);
    // 36 hours is the line: a 09:00 job checked at 20:00 the next day is fine.
    expect(backupSignal([ev("backup.taken", hoursAgo(35))], now)).toEqual([]);
  });

  it("alerts on a failure newer than the last success, with the reason", () => {
    const [sig] = backupSignal([
      ev("backup.taken", hoursAgo(27)),
      ev("backup.failed", hoursAgo(3), { reason: "No BLOB_READ_WRITE_TOKEN configured" }),
    ], now);
    expect(sig.level).toBe("alert");
    expect(sig.detail).toContain("No BLOB_READ_WRITE_TOKEN configured");
    expect(sig.detail).toMatch(/27 hours ago/);
    // A failure that was followed by a success is history, not an alert.
    expect(backupSignal([ev("backup.failed", hoursAgo(27)), ev("backup.taken", hoursAgo(3))], now)).toEqual([]);
  });
});

suite("the hook is wired", () => {
  it("instrumentation.ts records through the shaper, in Node only, and never throws", () => {
    const src = read("instrumentation.ts");
    expect(src).toMatch(/export const onRequestError/);
    expect(src).toMatch(/NEXT_RUNTIME !== "nodejs"/);
    expect(src).toMatch(/shapeError\(error, request, context\)/);
    expect(src).toMatch(/catch/);
  });

  it("the console reads it and states absence", () => {
    expect(read("lib/admin.ts")).toMatch(/recentErrors\(\)/);
    expect(read("lib/admin.ts")).toMatch(/errorSignals\(/);
    expect(read("lib/admin.ts")).toMatch(/backupSignal\(/);
    expect(read("app/admin/page.tsx")).toMatch(/None recorded/);
  });
});
