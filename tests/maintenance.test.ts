import { describe, expect, it } from "vitest";
import { documentStatus, dueStatus, nextCycle, type ReminderLike } from "../src/lib/maintenance";
import { presetIntervals, presetByKey } from "../src/lib/maintenance-presets";

const car = { meterType: "DISTANCE" as const, distanceUnit: "MI" as const, readingPrecision: "WHOLE" as const };
const km = { ...car, distanceUnit: "KM" as const };
const tractor = { meterType: "HOURS" as const, distanceUnit: "MI" as const, readingPrecision: "WHOLE" as const };
const mi = (n: number) => n * 100;

const oil: ReminderLike = {
  dueMode: "EITHER",
  dueReadingTicks: mi(55000),
  dueOn: "2026-12-01",
  intervalTicks: mi(5000),
  intervalMonths: 6,
};

describe("dueStatus", () => {
  it("is ok well before either limit", () => {
    const s = dueStatus(oil, mi(51000), "2026-07-01", car);
    expect(s.state).toBe("ok");
    expect(s.remainingTicks).toBe(mi(4000));
    expect(s.progress).toBeCloseTo(0.2);
  });

  it("is coming up inside 10% of the interval", () => {
    expect(dueStatus(oil, mi(54600), "2026-07-01", car).state).toBe("soon");
  });

  it("takes whichever limit comes first under EITHER", () => {
    // Plenty of miles left, but the date has passed.
    const s = dueStatus(oil, mi(51000), "2026-12-05", car);
    expect(s.state).toBe("overdue");
    expect(s.remainingDays).toBe(-4);
  });

  it("ignores the date under READING and the reading under DATE", () => {
    expect(dueStatus({ ...oil, dueMode: "READING" }, mi(51000), "2026-12-05", car).state).toBe("ok");
    expect(dueStatus({ ...oil, dueMode: "DATE" }, mi(56000), "2026-07-01", car).state).toBe("ok");
  });

  it("is overdue past the reading", () => {
    const s = dueStatus(oil, mi(55300), "2026-07-01", car);
    expect(s.state).toBe("overdue");
    expect(s.remainingTicks).toBe(-mi(300));
    expect(s.progress).toBe(1);
  });

  it("is due on the day", () => {
    expect(dueStatus({ ...oil, dueMode: "DATE" }, null, "2026-12-01", car).state).toBe("due");
  });

  it("stays quiet while snoozed, and returns after", () => {
    const r = { ...oil, snoozedUntil: "2026-12-20" };
    const s = dueStatus(r, mi(51000), "2026-12-05", car);
    expect(s.state).toBe("ok");
    expect(s.snoozed).toBe(true);
    expect(dueStatus(r, mi(51000), "2026-12-21", car).state).toBe("overdue");
  });

  it("uses a whole-unit window for hour meters with no interval", () => {
    const r: ReminderLike = { dueMode: "READING", dueReadingTicks: 100 * 60, dueOn: null, intervalTicks: null, intervalMonths: null };
    expect(dueStatus(r, 85 * 60, "2026-01-01", tractor).state).toBe("ok");
    expect(dueStatus(r, 95 * 60, "2026-01-01", tractor).state).toBe("soon");
  });

  it("cannot measure a reading limit without a current reading", () => {
    const s = dueStatus({ ...oil, dueMode: "READING" }, null, "2026-07-01", car);
    expect(s.state).toBe("ok");
    expect(s.remainingTicks).toBeNull();
  });
});

describe("nextCycle", () => {
  it("runs the interval from when the work was done", () => {
    expect(nextCycle(oil, "2026-07-10", mi(53100))).toEqual({
      dueReadingTicks: mi(58100),
      dueOn: "2027-01-10",
      isDone: false,
    });
  });

  it("clamps month ends", () => {
    expect(nextCycle({ ...oil, intervalMonths: 1 }, "2027-01-31", null).dueOn).toBe("2027-02-28");
  });

  it("finishes a one-off", () => {
    expect(nextCycle({ ...oil, intervalTicks: null, intervalMonths: null }, "2026-07-10", mi(53000)).isDone).toBe(true);
  });

  it("falls back to the old due reading when none is known", () => {
    expect(nextCycle({ ...oil, dueMode: "READING" }, "2026-07-10", null)).toEqual({
      dueReadingTicks: mi(60000),
      dueOn: null,
      isDone: false,
    });
  });
});

describe("presets", () => {
  it("uses the kilometre interval on a km vehicle, not a conversion", () => {
    expect(presetIntervals(presetByKey("oil")!, km).intervalTicks).toBe(8000 * 100);
    expect(presetIntervals(presetByKey("oil")!, car).intervalTicks).toBe(5000 * 100);
  });

  it("picks the due mode from which intervals exist", () => {
    expect(presetIntervals(presetByKey("oil")!, car).dueMode).toBe("EITHER");
    expect(presetIntervals(presetByKey("wipers")!, car).dueMode).toBe("DATE");
    expect(presetIntervals(presetByKey("spark-plugs")!, car).dueMode).toBe("READING");
    expect(presetIntervals(presetByKey("h-grease")!, tractor).intervalTicks).toBe(10 * 60);
  });
});

describe("documentStatus", () => {
  const doc = { kind: "INSURANCE" as const, startsOn: "2026-01-01", expiresOn: "2026-07-01", expiresAtReadingTicks: null, isArchived: false };

  it("warns 30 days out, 60 for registration", () => {
    expect(documentStatus(doc, null, "2026-05-15", car).state).toBe("ok");
    expect(documentStatus(doc, null, "2026-06-10", car).state).toBe("soon");
    expect(documentStatus({ ...doc, kind: "REGISTRATION" }, null, "2026-05-15", car).state).toBe("soon");
  });

  it("is overdue once expired, and silent once archived", () => {
    expect(documentStatus(doc, null, "2026-07-02", car).state).toBe("overdue");
    expect(documentStatus({ ...doc, isArchived: true }, null, "2026-07-02", car).state).toBe("ok");
  });

  it("expires a warranty on reading too", () => {
    const w = { ...doc, kind: "WARRANTY" as const, expiresOn: "2030-01-01", expiresAtReadingTicks: mi(36000) };
    expect(documentStatus(w, mi(36100), "2026-07-02", car).state).toBe("overdue");
  });
});

import { describeDue } from "../src/lib/due-text";

describe("describeDue", () => {
  it("leads with the nearer limit and offers the other", () => {
    const s = dueStatus(oil, mi(54800), "2026-07-01", car);
    expect(describeDue(s, oil.dueOn, oil.dueReadingTicks, car)).toEqual({
      primary: "200 mi to go",
      secondary: "or due 2026-12-01",
    });
  });

  it("words a document as expiring", () => {
    const doc = { kind: "INSURANCE" as const, startsOn: "2026-01-01", expiresOn: "2026-07-11", expiresAtReadingTicks: null, isArchived: false };
    const s = documentStatus(doc, null, "2026-07-01", car);
    expect(describeDue(s, doc.expiresOn, null, car, null, true).primary).toBe("expires in 10 days");
    expect(describeDue(documentStatus(doc, null, "2026-07-12", car), doc.expiresOn, null, car, null, true).primary).toBe("expired 2026-07-11");
  });
});
