import { describe, expect, it } from "vitest";
import {
  type CategoryKind,
  type DeriveEntry,
  fillGroups,
  orderEntries,
  summarise,
  withDistances,
} from "../src/lib/derive";

let seq = 0;
function e(
  occurredOn: string,
  readingMiles: number | null,
  kind: CategoryKind,
  extra: Partial<DeriveEntry> = {},
): DeriveEntry {
  seq++;
  return {
    id: `e${seq}`,
    occurredOn,
    readingTicks: readingMiles === null ? null : readingMiles * 100,
    kind,
    isBusiness: false,
    fuelQty: null,
    cost: null,
    isPartialFill: false,
    isMissedFill: false,
    odometerReset: false,
    createdAt: `2020-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
    categoryId: kind === "NOTE" ? null : "cat",
    ...extra,
  };
}
const miles = (ticks: number) => ticks / 100;

describe("ordering", () => {
  it("sorts by date, then reading, with null readings last", () => {
    const out = orderEntries([
      e("2025-01-05", 120, "TRIP"),
      e("2025-01-05", null, "NOTE"),
      e("2025-01-05", 110, "TRIP"),
      e("2025-01-01", 100, "TRIP"),
    ]);
    expect(out.map((x) => x.readingTicks)).toEqual([10000, 11000, 12000, null]);
  });
});

describe("distance chain", () => {
  it("computes deltas from the previous reading", () => {
    const d = withDistances([
      e("2025-01-01", 100, "TRIP"),
      e("2025-01-02", 130, "TRIP"),
      e("2025-01-03", 145, "TRIP"),
    ]);
    expect(d.map((x) => x.distanceTicks)).toEqual([null, 3000, 1500]);
  });

  it("keeps a NOTE row carrying a reading in the chain — it is the anchor", () => {
    // This is the spreadsheet's "Starting milage" row: category I, reading
    // 99,667. Dropping it from the chain would orphan the first real trip.
    const d = withDistances([
      e("2025-01-01", 99667, "NOTE"),
      e("2025-01-02", 99670, "TRIP"),
    ]);
    expect(d[0]!.distanceTicks).toBeNull();
    expect(d[1]!.distanceTicks).toBe(300);
  });

  it("ignores rows with no reading at all", () => {
    const d = withDistances([
      e("2025-01-01", 100, "TRIP"),
      e("2025-01-02", null, "NOTE"),
      e("2025-01-03", 120, "TRIP"),
    ]);
    expect(d[2]!.distanceTicks).toBe(2000);
  });

  it("breaks the chain on an odometer reset instead of going negative", () => {
    const d = withDistances([
      e("2025-01-01", 250000, "TRIP"),
      e("2025-01-02", 12, "TRIP", { odometerReset: true }),
      e("2025-01-03", 40, "TRIP"),
    ]);
    expect(d[1]!.distanceTicks).toBeNull();
    expect(d[2]!.distanceTicks).toBe(2800);
  });
});

describe("fuel economy — the spreadsheet's bug, fixed", () => {
  const fuel = (day: string, reading: number, qty: number, cost: number, partial = false) =>
    e(day, reading, "FUEL", { fuelQty: qty, cost, isPartialFill: partial });

  it("reproduces the real 69.61 / 5.35 pair as one correct figure", () => {
    // Straight from the 2025 sheet: a 4.439 gal splash after 309 miles, then
    // 12.329 gal after only 66 more. Naively that reads 69.6 then 5.4 MPG.
    const entries = [
      fuel("2025-01-08", 99715, 13.54, 40.06),
      fuel("2025-01-21", 100024, 4.439, 15.0, true),
      fuel("2025-01-22", 100090, 12.329, 36.97),
    ];
    const groups = fillGroups(withDistances(entries));
    expect(groups).toHaveLength(1);

    const g = groups[0]!;
    expect(g.fills).toHaveLength(2); // the splash was absorbed
    expect(miles(g.distanceTicks)).toBe(375);
    expect(g.fuelQty).toBeCloseTo(16.768, 3);
    expect(miles(g.economyTicksPerUnit!)).toBeCloseTo(22.36, 2);
  });

  it("does not invent economy for the first fill", () => {
    const groups = fillGroups(withDistances([fuel("2025-01-01", 1000, 10, 30)]));
    expect(groups).toHaveLength(0);
  });

  it("excludes a group containing a missed fill, but keeps its spend", () => {
    const entries = [
      fuel("2025-01-01", 1000, 10, 30),
      e("2025-02-01", 1400, "FUEL", { fuelQty: 12, cost: 36, isMissedFill: true }),
    ];
    const groups = fillGroups(withDistances(entries));
    expect(groups[0]!.excluded).toBe(true);
    expect(groups[0]!.economyTicksPerUnit).toBeNull();
    expect(summarise(entries).fuelSpend).toBe(66);
  });

  it("excludes a group whose fill has no quantity recorded", () => {
    // Five such rows exist in the real file.
    const entries = [
      fuel("2025-01-01", 1000, 10, 30),
      e("2025-02-01", 1300, "FUEL", { fuelQty: null, cost: 40 }),
    ];
    expect(fillGroups(withDistances(entries))[0]!.excluded).toBe(true);
  });

  it("aggregate economy is not the mean of per-fill figures", () => {
    const entries = [
      fuel("2025-01-01", 0, 10, 30),
      fuel("2025-01-10", 300, 10, 30), // 30 mpg
      fuel("2025-01-20", 400, 20, 60), // 5 mpg
    ];
    const s = summarise(entries);
    // Mean of 30 and 5 would be 17.5. The honest figure is 400 mi / 30 gal.
    expect(miles(s.aggregateEconomyTicksPerUnit!)).toBeCloseTo(13.33, 2);
  });
});

describe("business / personal split", () => {
  it("splits distance by category, and NOTE distance counts as neither", () => {
    const entries = [
      e("2025-01-01", 1000, "NOTE"),
      e("2025-01-02", 1100, "TRIP", { isBusiness: true }),
      e("2025-01-03", 1150, "TRIP", { isBusiness: false }),
      e("2025-01-04", 1160, "NOTE"),
    ];
    const s = summarise(entries);
    expect(miles(s.businessDistanceTicks)).toBe(100);
    expect(miles(s.personalDistanceTicks)).toBe(50);
    expect(miles(s.unclassifiedDistanceTicks)).toBe(10);
    expect(miles(s.totalDistanceTicks)).toBe(160);
  });

  it("counts a business fuel stop toward business distance", () => {
    const entries = [
      e("2025-01-01", 1000, "TRIP"),
      e("2025-01-02", 1300, "FUEL", { isBusiness: true, fuelQty: 12, cost: 40 }),
    ];
    expect(miles(summarise(entries).businessDistanceTicks)).toBe(300);
  });
});

describe("period bounds", () => {
  it("does not lose the distance leading into the first entry of a period", () => {
    const entries = [
      e("2024-12-30", 1000, "TRIP"),
      e("2025-01-02", 1120, "TRIP"),
      e("2025-01-09", 1200, "TRIP"),
    ];
    const s = summarise(entries, { from: "2025-01-01", to: "2025-12-31" });
    // 120 into the 2nd of January is real 2025 travel even though the
    // previous reading was taken in December.
    expect(miles(s.totalDistanceTicks)).toBe(200);
    expect(s.entryCount).toBe(2);
  });
});

describe("a suspect reading must not poison the rows after it", () => {
  it("does not manufacture a phantom climb from a low outlier", () => {
    // Straight from the real file: a row mis-dated into the wrong year lands
    // among far higher readings. Adopting it as the baseline credited the
    // next row with tens of thousands of miles.
    const entries = [
      e("2024-06-01", 97000, "TRIP"),
      e("2024-07-01", 11218, "TRIP"), // mis-dated, belongs in 2017
      e("2024-07-02", 97100, "TRIP"),
    ];
    const d = withDistances(entries);
    expect(d[1]!.distanceTicks).toBeNull();
    expect(miles(d[2]!.distanceTicks!)).toBe(100);
    expect(miles(summarise(entries).totalDistanceTicks)).toBe(100);
  });

  it("still honours a declared odometer reset", () => {
    const d = withDistances([
      e("2025-01-01", 250000, "TRIP"),
      e("2025-01-02", 12, "TRIP", { odometerReset: true }),
      e("2025-01-03", 40, "TRIP"),
    ]);
    expect(d[2]!.distanceTicks).toBe(2800);
  });

  it("counts a repeated reading as zero distance, not as a break", () => {
    const d = withDistances([
      e("2025-01-01", 1000, "TRIP"),
      e("2025-01-01", 1000, "TRIP"),
      e("2025-01-02", 1010, "TRIP"),
    ]);
    expect(d[1]!.distanceTicks).toBe(0);
    expect(miles(d[2]!.distanceTicks!)).toBe(10);
  });
});

describe("tanks that cannot be true are kept out of the averages", () => {
  const fill = (day: string, reading: number, qty: number) =>
    e(day, reading, "FUEL", { fuelQty: qty, cost: qty * 3 });

  it("marks a tank far above the vehicle's own median", () => {
    // Twelve ordinary tanks at ~25 mpg, then one stretch where a fill-up was
    // never recorded, so its distance lands on the following tank.
    const entries = [fill("2025-01-01", 0, 10)];
    let reading = 0;
    for (let i = 1; i <= 12; i++) {
      reading += 250;
      entries.push(fill(`2025-02-${String(i).padStart(2, "0")}`, reading, 10));
    }
    reading += 2000; // a whole tank's worth of driving, unlogged
    entries.push(fill("2025-03-01", reading, 10));

    const groups = fillGroups(withDistances(entries));
    const last = groups.at(-1)!;
    expect(last.excluded).toBe(true);
    expect(last.economyTicksPerUnit).toBeNull();
    expect(last.excludedReason).toContain("probably not recorded");
    // The spend is still real and still counted.
    expect(last.cost).toBe(30);
  });

  it("leaves an ordinary spread of tanks alone", () => {
    const entries = [fill("2025-01-01", 0, 10)];
    let reading = 0;
    for (let i = 1; i <= 12; i++) {
      reading += 230 + i * 6; // 23 to 30 mpg, all plausible
      entries.push(fill(`2025-02-${String(i).padStart(2, "0")}`, reading, 10));
    }
    const groups = fillGroups(withDistances(entries));
    expect(groups.filter((g) => g.excluded)).toHaveLength(0);
  });

  it("does nothing when there is too little history to know what is usual", () => {
    const entries = [fill("2025-01-01", 0, 10), fill("2025-02-01", 2000, 10)];
    expect(fillGroups(withDistances(entries))[0]!.excluded).toBe(false);
  });
});
