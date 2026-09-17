import { describe, expect, it } from "vitest";
import { lastMonthRange, resolveRange } from "../src/lib/reports";

describe("lastMonthRange", () => {
  it("returns the previous calendar month on a mid-month date", () => {
    expect(lastMonthRange(new Date(2026, 8, 17))).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("crosses the year boundary in January", () => {
    expect(lastMonthRange(new Date(2026, 0, 3))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("finds the correct last day of a short month", () => {
    // Feb 2024 was a leap month; Feb 2023 wasn't.
    expect(lastMonthRange(new Date(2024, 2, 15)).to).toBe("2024-02-29");
    expect(lastMonthRange(new Date(2023, 2, 15)).to).toBe("2023-02-28");
    // 30-day month.
    expect(lastMonthRange(new Date(2024, 6, 1)).to).toBe("2024-06-30");
  });
});

describe("resolveRange", () => {
  const now = new Date(2026, 8, 17);

  it("defaults to the current calendar year", () => {
    expect(resolveRange({ now })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      suffix: "2026",
    });
  });

  it("honours an explicit year", () => {
    expect(resolveRange({ year: "2019", now })).toEqual({
      from: "2019-01-01",
      to: "2019-12-31",
      suffix: "2019",
    });
  });

  it("returns last month for range=last-month", () => {
    expect(resolveRange({ range: "last-month", now })).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
      suffix: "2026-08",
    });
  });

  it("prefers explicit from/to over range and year", () => {
    expect(
      resolveRange({
        range: "last-month",
        year: "2020",
        from: "2024-06-15",
        to: "2024-07-14",
        now,
      }),
    ).toEqual({
      from: "2024-06-15",
      to: "2024-07-14",
      suffix: "2024-06-15_2024-07-14",
    });
  });

  it("ignores malformed year, range, from, and to", () => {
    // A ?year=hello or ?from=not-a-date link should not 400 — it falls
    // through to the current year instead.
    expect(resolveRange({ year: "hi", now })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      suffix: "2026",
    });
    expect(resolveRange({ from: "2024-06-15", to: "not-a-date", now })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      suffix: "2026",
    });
    // from after to is not a real range, so it falls through too.
    expect(resolveRange({ from: "2024-07-14", to: "2024-06-15", now })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      suffix: "2026",
    });
  });
});
