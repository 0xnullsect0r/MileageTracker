import { describe, expect, it } from "vitest";
import { costsByYear, ownershipCosts } from "../src/lib/costs";

const entries = [
  { occurredOn: "2025-03-01", kind: "FUEL" as const, cost: 40.1 },
  { occurredOn: "2025-06-01", kind: "SERVICE" as const, cost: 89.99 },
  { occurredOn: "2026-01-05", kind: "FUEL" as const, cost: 38 },
  { occurredOn: "2026-02-01", kind: "TRIP" as const, cost: 12.5 },
  { occurredOn: "2026-02-02", kind: "TRIP" as const, cost: null },
];
const docs = [
  { startsOn: "2026-01-01", expiresOn: "2027-01-01", createdOn: "2025-12-20", cost: 600 },
  { startsOn: null, expiresOn: null, createdOn: "2025-05-01", cost: 45 },
  { startsOn: "2026-01-01", expiresOn: null, createdOn: "2026-01-01", cost: null },
];

describe("ownershipCosts", () => {
  it("splits by kind over all time", () => {
    expect(ownershipCosts(entries, docs)).toEqual({ fuel: 78.1, service: 89.99, fees: 645, other: 12.5, total: 825.59 });
  });

  it("puts a document's cost on the day its period starts", () => {
    const y = ownershipCosts(entries, docs, { from: "2026-01-01", to: "2026-12-31" });
    expect(y.fees).toBe(600);
    expect(y.fuel).toBe(38);
  });
});

describe("costsByYear", () => {
  it("returns one row per year with any cost", () => {
    const rows = costsByYear(entries, docs);
    expect(rows.map((r) => r.year)).toEqual(["2025", "2026"]);
    expect(rows[0]!.fees).toBe(45);
    expect(rows[1]!.total).toBe(650.5);
  });
});
