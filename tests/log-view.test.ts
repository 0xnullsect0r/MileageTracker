import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, filterRows, parseView, sortRows, viewToSearch } from "../src/lib/log-view";

const row = (id: string, occurredOn: string, extra: Partial<Parameters<typeof filterRows>[0][number]> = {}) => ({
  id,
  occurredOn,
  readingTicks: null,
  distanceTicks: null,
  description: null,
  categoryCode: null,
  categoryName: null,
  fuelQty: null,
  pricePerUnit: null,
  cost: null,
  economy: null,
  needsReview: false,
  ...extra,
});

// In log order, as loadLog returns them: by date, then reading.
const rows = [
  row("a", "2025-01-03", { readingTicks: 1000, categoryCode: "G", categoryName: "Gas", cost: 40, description: "Shell" }),
  row("b", "2025-01-03", { readingTicks: 1100, categoryCode: "B", categoryName: "Business", description: "client visit" }),
  row("c", "2025-06-10", { readingTicks: 2000, categoryCode: "S", categoryName: "Service", cost: 89.99, description: "Oil change" }),
  row("d", "2026-02-01", { readingTicks: 2500, categoryCode: "G", categoryName: "Gas", cost: 12.5, needsReview: true }),
];
const ids = (r: { id: string }[]) => r.map((x) => x.id).join("");

describe("sortRows", () => {
  it("defaults to newest first, keeping same-day entries in reverse odometer order", () => {
    expect(DEFAULT_VIEW.sort).toBe("date");
    expect(DEFAULT_VIEW.dir).toBe("desc");
    expect(ids(sortRows(rows, "date", "desc"))).toBe("dcba");
    expect(ids(sortRows(rows, "date", "asc"))).toBe("abcd");
  });

  it("puts blanks last in either direction", () => {
    expect(ids(sortRows(rows, "cost", "desc"))).toBe("cadb");
    expect(ids(sortRows(rows, "cost", "asc"))).toBe("dacb");
  });

  it("sorts text without regard to case, ties newest first", () => {
    expect(ids(sortRows(rows, "description", "asc"))).toBe("bcad");
    expect(ids(sortRows(rows, "category", "asc"))).toBe("bdac");
  });
});

describe("filterRows", () => {
  it("combines year, category, text, range and review", () => {
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, year: "2025" }))).toBe("abc");
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, cats: ["G", "S"] }))).toBe("acd");
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, q: "OIL" }))).toBe("c");
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, q: "gas" }))).toBe("ad"); // category name
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, from: "2025-01-04", to: "2026-01-31" }))).toBe("c");
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, from: "2026-01-31", to: "2025-01-04" }))).toBe("c");
    expect(ids(filterRows(rows, { ...DEFAULT_VIEW, reviewOnly: true }))).toBe("d");
  });
});

describe("URL round trip", () => {
  it("keeps the default view out of the URL", () => {
    expect(viewToSearch(DEFAULT_VIEW)).toBe("");
    expect(parseView({})).toEqual(DEFAULT_VIEW);
  });

  it("survives a round trip", () => {
    const view = { ...DEFAULT_VIEW, sort: "cost" as const, dir: "asc" as const, q: "shell", cats: ["G", "B"], from: "2025-01-01", reviewOnly: true };
    const params = Object.fromEntries(new URLSearchParams(viewToSearch(view)));
    expect(parseView(params)).toEqual(view);
  });

  it("still honours the garage's ?review=1 link and ignores junk", () => {
    expect(parseView({ review: "1" }).reviewOnly).toBe(true);
    expect(parseView({ sort: "nope", dir: "sideways", year: "20x5", from: "yesterday" })).toEqual(DEFAULT_VIEW);
  });
});
