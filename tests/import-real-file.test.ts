/**
 * The import pipeline, run against the actual spreadsheet.
 *
 * Fixture is the real "Car Log - Marshal.numbers" as the parser sidecar
 * returns it. Every number asserted here was measured from the file itself,
 * so a regression in mapping or detection shows up as a changed count.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type ParsedDocument,
  autoMap,
  buildRows,
  detectShape,
} from "../src/lib/import/mapping";
import { detectOutliers, type ImportRow } from "../src/lib/import/outliers";
import { buildPlan, resolve } from "../src/lib/import/plan";

const doc = JSON.parse(
  readFileSync(new URL("./fixtures/marshal.json", import.meta.url), "utf8"),
) as ParsedDocument;

const logTable = (sheetName: string) =>
  doc.sheets.find((s) => s.name === sheetName)!.tables.find((t) => t.name === "Trips, Gas, Service")!;

describe("shape detection", () => {
  it("finds one log table per year sheet, and the side tables", () => {
    const shape = detectShape(doc);
    expect(shape.yearPerSheet).toBe(true);
    expect(shape.logTables).toHaveLength(10); // 2016-2025
    expect(shape.sideTables.filter((t) => t.looksLikeReminders)).toHaveLength(2);
  });

  it("spots the Categories key as a side table, not a log", () => {
    const shape = detectShape(doc);
    expect(shape.logTables.some((t) => t.table === "Categories")).toBe(false);
  });
});

describe("column mapping", () => {
  const headers = logTable("2025").headers;

  it("reads the real header row", () => {
    expect(headers).toEqual([
      "Date", "Milage", "C", "Description", "$/Gal", "Gallons", "Cost", "Miles", "Mileage",
    ]);
  });

  it('maps "Milage" to the odometer and ignores "Mileage" — they are different columns', () => {
    // The file's trap: column B is the odometer (misspelled "Milage") and
    // column I is computed MPG ("Mileage"). A fuzzy match imports MPG as the
    // odometer and corrupts everything downstream.
    const { targets } = autoMap(headers);
    expect(targets[1]).toBe("reading");
    expect(targets[8]).toBe("ignore");
  });

  it("ignores both computed columns, which lib/derive recomputes correctly", () => {
    const { targets } = autoMap(headers);
    expect(targets[7]).toBe("ignore"); // Miles
    expect(targets[8]).toBe("ignore"); // Mileage
  });

  it("maps everything else", () => {
    expect(autoMap(headers).targets).toEqual([
      "date", "reading", "category", "description", "pricePerUnit", "fuelQty", "cost", "ignore", "ignore",
    ]);
  });
});

describe("the whole file, mapped", () => {
  const all = doc.sheets
    .flatMap((s) => s.tables.filter((t) => t.name === "Trips, Gas, Service").map((t) => ({ s, t })))
    .map(({ s, t }) => buildRows(s.name, t, autoMap(t.headers)));

  const rows = all.flatMap((r) => r.rows);
  const blanks = all.reduce((a, r) => a + r.blankRowsDropped, 0);

  it("drops exactly the 26 blank rows and keeps the rest", () => {
    // 3,338 log rows across the ten year sheets. (The file holds 3,349 rows
    // in total; the other 11 are the service-note and category-key tables.)
    expect(blanks).toBe(26);
    expect(rows).toHaveLength(3338 - 26);
  });

  it("holds the 15 rows that have data but no category", () => {
    const uncategorised = rows.filter((r) => r.categoryCode === null);
    expect(uncategorised).toHaveLength(15);
  });

  it("finds the category spread the Key sheet describes", () => {
    const counts = new Map<string, number>();
    for (const r of rows) if (r.categoryCode) counts.set(r.categoryCode, (counts.get(r.categoryCode) ?? 0) + 1);
    expect(counts.get("P")).toBe(1831);
    expect(counts.get("B")).toBe(1058);
    expect(counts.get("G")).toBe(359);
    expect(counts.get("S")).toBe(36);
    expect(counts.get("I")).toBe(13);
  });

  it("reads dates as dates, discarding the timezone artifacts", () => {
    const dated = rows.filter((r) => r.date !== null);
    expect(dated.length).toBeGreaterThan(3200);
    for (const r of dated.slice(0, 50)) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("detecting the two real typos in the real data", () => {
  const toImportRows = (sheet: string): ImportRow[] => {
    const t = logTable(sheet);
    return buildRows(sheet, t, autoMap(t.headers)).rows.map((r) => ({
      ref: r.ref,
      occurredOn: r.date,
      readingTicks: r.readingRaw === null ? null : Math.round(r.readingRaw * 100),
      categoryCode: r.categoryCode,
      description: r.description,
      fuelQty: r.fuelQty,
      pricePerUnit: r.pricePerUnit,
      cost: r.cost,
    }));
  };
  const YEARS = ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025"];
  const optsFor = (year: string) => ({
    ticksPerUnit: 100,
    tankCapacity: 14,
    knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
    fuelCategoryCodes: new Set(["G"]),
    minYear: 2016,
    maxYear: 2027,
    expectedYear: Number(year),
  });
  const opts = optsFor("2020");

  it("catches 566698 in the 2020 sheet and proposes 56,698, and only 56,698", () => {
    const f = detectOutliers(toImportRows("2020"), opts).find((x) => x.rowRef === "2020!145");
    expect(f!.type).toBe("READING_SPIKE");
    expect(f!.suggestions.map((s) => s.label)).toEqual(["56,698"]);
    expect(f!.suggestions[0]!.reason).toContain("doubled 6");
    // Unambiguous, so it may be accepted in bulk.
    expect(f!.defaultAction).toBe("CORRECT");
  });

  it("catches 140277 gallons in the 2022 sheet and proposes 14.0277", () => {
    const findings = detectOutliers(toImportRows("2022"), optsFor("2022")).filter(
      (f) => f.type === "FUEL_QTY_IMPLAUSIBLE",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.suggestions[0]!.value).toBeCloseTo(14.0277, 4);
    expect(findings[0]!.suggestions[0]!.reason).toContain("$71.53");
  });

  it("finds 12 out-of-sequence readings across the whole file", () => {
    // Measured, not assumed. Beyond the two typos found by hand, the
    // detector surfaces genuine transposition errors the sheet has carried
    // for years — 31697 for 31967, 71794 for 71974.
    const spikes = YEARS.flatMap((y) =>
      detectOutliers(toImportRows(y), optsFor(y)).filter((f) => f.type === "READING_SPIKE"),
    );
    expect(spikes).toHaveLength(12);
  });

  it("proposes the correct 72,252 first for 2021!231, ahead of the merely plausible", () => {
    // A single mistyped digit (71252 for 72252). A transposition repair also
    // "fits" here and would be wrong; ranking by closeness to the neighbours
    // puts the right one first.
    const f = detectOutliers(toImportRows("2021"), optsFor("2021")).find(
      (x) => x.rowRef === "2021!231",
    );
    expect(f!.suggestions[0]!.label).toBe("72,252");
    expect(f!.defaultAction).toBe("ASK"); // more than one candidate fits
  });

  it("treats a row dated 2025 inside the 2024 sheet as a date error, not a reading error", () => {
    // 2024!351 is dated 2025-10-23. A digit edit can be contrived for its
    // reading, which would send the user to fix a number that was right.
    const f = detectOutliers(toImportRows("2024"), optsFor("2024")).find(
      (x) => x.rowRef === "2024!351",
    );
    expect(f!.type).toBe("DATE_OUT_OF_RANGE");
    expect(f!.field).toBe("date");
  });

  it("does not cascade false reversals from undated rows", () => {
    // Regression guard: sorting undated rows first once made an arbitrary
    // reading the baseline and produced 859 false reversals.
    const reversals = YEARS.flatMap((y) =>
      detectOutliers(toImportRows(y), optsFor(y)).filter((f) => f.type === "READING_REVERSAL"),
    );
    expect(reversals.length).toBeLessThanOrEqual(5);
  });

  it("keeps the whole review queue small enough for a person to work through", () => {
    const all = YEARS.flatMap((y) => detectOutliers(toImportRows(y), optsFor(y)));
    const errors = all.filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(13); // 12 readings + the 140277 gallons
    expect(all.length).toBeLessThan(120); // out of 3,323 imported rows
  });
});

describe("the full import plan for the real file", () => {
  const tables = doc.sheets
    .filter((s) => /^(19|20)\d{2}$/.test(s.name))
    .map((s) => ({ sheet: s.name, table: "Trips, Gas, Service" }));
  const plan = buildPlan(doc, {
    tables,
    ticksPerUnit: 100,
    tankCapacity: 14,
    knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
    fuelCategoryCodes: new Set(["G"]),
    minYear: 2016,
    maxYear: 2027,
  });

  it("reads 3,312 rows after dropping the 26 blanks", () => {
    expect(plan.stats.rowsRead).toBe(3312);
    expect(plan.stats.blankRowsDropped).toBe(26);
  });

  it("catches the year-boundary rows that per-sheet detection cannot see", () => {
    // Two carry-forward patterns: six "Last Gas Stop Last Year" fills and
    // seven "Starting milage" anchors, each repeating the previous year's
    // last reading. Importing both copies would double-count them.
    expect(plan.stats.duplicatesAcrossSheets).toBe(13);
    const dup = plan.findings.find((f) => f.type === "DUPLICATE_ROW" && f.message.includes("earlier sheet"));
    expect(dup!.defaultAction).toBe("SKIP");
  });

  it("skips the placeholder copy, never the real fill-up it was copied from", () => {
    // The file lists sheets newest-first. Processed in that order, dedupe
    // would keep the January-1st placeholder and discard the real Chevron
    // fill-up, along with its date and its fuel quantity.
    const chevron = plan.rows.find((r) => r.ref === "2024!375")!;
    const placeholder = plan.rows.find((r) => r.ref === "2025!3")!;
    expect(chevron.duplicateOf).toBeNull();
    expect(placeholder.duplicateOf).toBe("2024!375");
  });

  it("keeps the review queue proportionate to a 3,300-row file", () => {
    expect(plan.stats.errors).toBe(13);
    expect(plan.stats.errors + plan.stats.warnings).toBeLessThan(130);
  });

  it("applies an accepted correction and keeps the original recoverable", () => {
    const f = plan.findings.find((x) => x.rowRef === "2020!145")!;
    const resolved = resolve(plan, [
      { rowRef: "2020!145", field: "reading", action: "CORRECT", value: f.suggestions[0]!.value },
    ]);
    const row = resolved.find((r) => r.ref === "2020!145")!;
    expect(row.readingTicks).toBe(5669800);
    expect(row.originalNote).toContain("56669800");
    expect(row.skip).toBe(false);
  });

  it("never applies a correction that was not decided", () => {
    // Silence is not consent: the row imports as it stands, flagged.
    const resolved = resolve(plan, []);
    const row = resolved.find((r) => r.ref === "2020!145")!;
    expect(row.readingTicks).toBe(56669800);
    expect(row.needsReview).toBe(true);
    expect(row.reviewReason).toContain("cannot go back down");
  });

  it("skips the cross-sheet duplicates by default", () => {
    const resolved = resolve(plan, []);
    const skipped = resolved.filter((r) => r.skip);
    expect(skipped.length).toBeGreaterThanOrEqual(8);
  });
});

describe("fuel reconciliation against the source sheet", () => {
  // The strongest check in the suite: every dollar of fuel in the
  // spreadsheet is either imported or deliberately skipped, and we can say
  // which. Requires no database — it compares the resolved plan directly
  // against the sheets it came from.
  const tables = doc.sheets
    .filter((s) => /^(19|20)\d{2}$/.test(s.name))
    .map((s) => ({ sheet: s.name, table: "Trips, Gas, Service" }));
  const plan = buildPlan(doc, {
    tables,
    ticksPerUnit: 100,
    tankCapacity: 12.4,
    knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
    fuelCategoryCodes: new Set(["G"]),
    minYear: 2016,
    maxYear: 2027,
  });
  // Accept the unambiguous corrections, as the importer's default does.
  const resolved = resolve(
    plan,
    plan.findings
      .filter((f) => f.defaultAction === "CORRECT" && f.suggestions.length === 1)
      .map((f) => ({ rowRef: f.rowRef, field: f.field, action: "CORRECT" as const, value: f.suggestions[0]!.value })),
  );

  const sheetFuelTotal = (sheet: string): number => {
    const t = doc.sheets.find((s) => s.name === sheet)!.tables.find((x) => x.name === "Trips, Gas, Service")!;
    return buildRows(sheet, t, autoMap(t.headers))
      .rows.filter((r) => r.categoryCode === "G")
      .reduce((a, r) => a + (r.cost ?? 0), 0);
  };

  it("accounts for every dollar of fuel, to the cent", () => {
    for (const year of ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]) {
      const rows = resolved.filter((r) => r.sheet === year && r.categoryCode === "G");
      const kept = rows.filter((r) => !r.skip).reduce((a, r) => a + (r.cost ?? 0), 0);
      const skipped = rows.filter((r) => r.skip).reduce((a, r) => a + (r.cost ?? 0), 0);
      // 2022's sheet total carries the 140,277-gallon typo.
      const sheetTotal =
        year === "2022" ? sheetFuelTotal(year) - 715272.423 + 14.0277 * 5.099 : sheetFuelTotal(year);
      expect(Math.abs(kept + skipped - sheetTotal), `${year}`).toBeLessThan(0.05);
    }
  });

  it("keeps a fuel purchase that has neither a date nor a reading", () => {
    // 2017!220 is a real $33.47 BP fill-up recorded with only its gallons
    // and price. An earlier commit filter required a date or a reading and
    // dropped it silently.
    const row = resolved.find((r) => r.ref === "2017!220");
    expect(row).toBeDefined();
    expect(row!.skip).toBe(false);
    expect(row!.cost).toBeCloseTo(33.47, 2);
  });

  it("does not mistake a trip and a fill at the same odometer for a duplicate", () => {
    // "Ari bus" and "Fuel 76" are both logged at 79,854 on 2022-11-29.
    // Keying duplicates on date and reading alone discarded the fill-up.
    const fill = resolved.find((r) => r.ref === "2022!330");
    expect(fill!.skip).toBe(false);
    expect(fill!.description).toContain("Fuel");
  });
});
