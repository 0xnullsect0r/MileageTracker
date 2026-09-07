import { describe, expect, it } from "vitest";
import {
  type DetectOptions,
  type ImportRow,
  detectOutliers,
  repairFuelQty,
  repairReading,
} from "../src/lib/import/outliers";

const opts: DetectOptions = {
  ticksPerUnit: 100,
  tankCapacity: 14,
  knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
  fuelCategoryCodes: new Set(["G"]),
  minYear: 2016,
  maxYear: 2027,
};

let n = 0;
/** Each row gets its own increasing date, so canonical (date, reading)
 *  ordering does not silently reshuffle a sequence under test. */
function row(over: Partial<ImportRow> = {}): ImportRow {
  n++;
  const day = new Date(Date.UTC(2020, 0, 1) + (n - 1) * 864e5).toISOString().slice(0, 10);
  return {
    ref: `r${n}`,
    occurredOn: day,
    readingTicks: null,
    categoryCode: "P",
    description: "Errands",
    fuelQty: null,
    pricePerUnit: null,
    cost: null,
    ...over,
  };
}

describe("the 2020 odometer typo — 566698", () => {
  // Real rows 141-147 of the 2020 sheet.
  const rows = [
    row({ occurredOn: "2020-04-27", readingTicks: 5663200, categoryCode: "G", fuelQty: 12.637, pricePerUnit: 2.499, cost: 31.58 }),
    row({ occurredOn: "2020-04-30", readingTicks: 5667000, categoryCode: "B" }),
    row({ occurredOn: "2020-05-13", readingTicks: 5669400 }),
    row({ occurredOn: "2020-05-15", readingTicks: 56669800, description: "ShopRite" }),
    row({ occurredOn: "2020-05-22", readingTicks: 5671600 }),
    row({ occurredOn: "2020-05-26", readingTicks: 5673000 }),
  ];

  it("flags it, and suggests 56,698 and only 56,698", () => {
    const found = detectOutliers(rows, opts).filter((f) => f.field === "reading");
    expect(found).toHaveLength(1);
    expect(found[0]!.type).toBe("READING_SPIKE");
    expect(found[0]!.suggestions.map((s) => s.label)).toEqual(["56,698"]);
    expect(found[0]!.suggestions[0]!.value).toBe(5669800);
    expect(found[0]!.suggestions[0]!.reason).toContain("doubled 6");
  });

  it("raises nothing at all on the surrounding clean rows", () => {
    const refs = new Set(detectOutliers(rows, opts).map((f) => f.rowRef));
    expect(refs).toEqual(new Set([rows[3]!.ref]));
  });
});

describe("the 2022 fuel typo — 140277 gallons", () => {
  const rows = [
    row({ occurredOn: "2022-07-20", readingTicks: 7659600, categoryCode: "G", fuelQty: 13.1, pricePerUnit: 4.899, cost: 64.18 }),
    row({ occurredOn: "2022-07-29", readingTicks: 7694000 }),
    row({
      occurredOn: "2022-07-31",
      readingTicks: 7694300,
      categoryCode: "G",
      description: "Speedway",
      fuelQty: 140277,
      pricePerUnit: 5.099,
      cost: 715272.42,
    }),
    row({ occurredOn: "2022-08-01", readingTicks: 7697900 }),
  ];

  it("flags the quantity and proposes 14.0277", () => {
    const found = detectOutliers(rows, opts).filter((f) => f.field === "fuelQty");
    expect(found).toHaveLength(1);
    expect(found[0]!.type).toBe("FUEL_QTY_IMPLAUSIBLE");
    expect(found[0]!.suggestions[0]!.value).toBeCloseTo(14.0277, 4);
    expect(found[0]!.suggestions[0]!.reason).toContain("$71.53");
  });

  it("rejects the 1.40277 shift, because 247 MPG is not a thing", () => {
    const labels = detectOutliers(rows, opts)
      .filter((f) => f.field === "fuelQty")
      .flatMap((f) => f.suggestions.map((s) => s.value));
    expect(labels).not.toContain(1.4028);
    expect(labels).toHaveLength(1);
  });

  it("does not double-report the same row as a cost mismatch", () => {
    const types = detectOutliers(rows, opts).map((f) => f.type);
    expect(types.filter((t) => t === "COST_MISMATCH")).toHaveLength(0);
  });
});

describe("false positives — the assertion that matters most", () => {
  it("a clean run of 200 ordinary rows produces zero findings", () => {
    const rows: ImportRow[] = [];
    let reading = 99667 * 100;
    for (let i = 0; i < 200; i++) {
      reading += (7 + (i % 23)) * 100;
      const isFuel = i % 12 === 0;
      const qty = 12 + (i % 3) * 0.4;
      const price = 3.279;
      rows.push(
        row({
          readingTicks: reading,
          categoryCode: isFuel ? "G" : i % 3 === 0 ? "B" : "P",
          fuelQty: isFuel ? qty : null,
          pricePerUnit: isFuel ? price : null,
          cost: isFuel ? Math.round(qty * price * 100) / 100 : null,
        }),
      );
    }
    expect(detectOutliers(rows, opts)).toEqual([]);
  });

  it("a long road trip is not mistaken for a typo", () => {
    const rows = [
      row({ readingTicks: 5000000 }),
      row({ readingTicks: 5001000 }),
      row({ readingTicks: 5060000, description: "Drive to Maine" }),
      row({ readingTicks: 5061000 }),
    ];
    expect(detectOutliers(rows, opts).filter((f) => f.field === "reading")).toEqual([]);
  });
});

describe("other detectors", () => {
  it("flags a reading that goes backwards", () => {
    const rows = [row({ readingTicks: 5000000 }), row({ readingTicks: 4000000 })];
    const f = detectOutliers(rows, opts).filter((x) => x.field === "reading");
    expect(f[0]!.type).toBe("READING_REVERSAL");
  });

  it("flags a genuinely identical row and defaults it to skip", () => {
    const same = { occurredOn: "2024-12-16", readingTicks: 9943200, categoryCode: "G", description: "Chevron", fuelQty: 13.36, pricePerUnit: 3.279, cost: 43.81 };
    const dup = detectOutliers([row(same), row(same)], opts).find((f) => f.type === "DUPLICATE_ROW");
    expect(dup?.defaultAction).toBe("SKIP");
  });

  it("does not flag a trip and a fill-up logged at the same odometer", () => {
    // Real pattern: "Ari bus" and "Fuel 76" both at 79,854 on one day.
    // Keying on date and reading alone discarded the fill-up.
    const rows = [
      row({ occurredOn: "2022-11-29", readingTicks: 7985400, categoryCode: "P", description: "Ari bus" }),
      row({ occurredOn: "2022-11-29", readingTicks: 7985400, categoryCode: "G", description: "Fuel 76", fuelQty: 12.1, pricePerUnit: 4.16, cost: 50.34 }),
    ];
    expect(detectOutliers(rows, opts).filter((f) => f.type === "DUPLICATE_ROW")).toEqual([]);
  });

  it("derives a missing fuel quantity from cost ÷ price", () => {
    const rows = [row({ readingTicks: 100000, categoryCode: "G", cost: 40.0, pricePerUnit: 3.2 })];
    const f = detectOutliers(rows, opts).find((x) => x.type === "FUEL_QTY_MISSING");
    expect(f!.suggestions[0]!.value).toBeCloseTo(12.5, 3);
  });

  it("holds a row with no category rather than guessing", () => {
    const f = detectOutliers([row({ categoryCode: null, readingTicks: 100000 })], opts);
    expect(f[0]!.type).toBe("CATEGORY_MISSING");
    expect(f[0]!.defaultAction).toBe("ASK");
    expect(f[0]!.suggestions).toEqual([]);
  });

  it("flags a cost that disagrees with quantity × price", () => {
    const rows = [row({ readingTicks: 100000, categoryCode: "G", fuelQty: 10, pricePerUnit: 3, cost: 45 })];
    const f = detectOutliers(rows, opts).find((x) => x.type === "COST_MISMATCH");
    expect(f!.suggestions[0]!.value).toBe(30);
  });
});

describe("repair helpers in isolation", () => {
  it("offers nothing when no edit fits between the neighbours", () => {
    expect(repairReading(9999900, 100, 200, 100)).toEqual([]);
  });
  it("un-transposes a swapped pair", () => {
    // 56,749 between 56,470 and 56,500 -> un-swapping 74 gives 56,479.
    const s = repairReading(5674900, 5647000, 5650000, 100);
    expect(s[0]!.label).toBe("56,479");
  });
  it("returns no fuel suggestion when every shift is implausible", () => {
    expect(repairFuelQty({ fuelQty: 3, pricePerUnit: 3, cost: 9 }, null, { tankCapacity: 14, ticksPerUnit: 100 })).toEqual([]);
  });
});
