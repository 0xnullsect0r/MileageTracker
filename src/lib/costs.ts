/**
 * Cost of ownership: what a vehicle has cost, by kind, over a period.
 *
 * Fuel and service come from the log. Fees (registration, insurance and so
 * on) come from documents only, so a renewal is never counted twice.
 */
import type { CategoryKind } from "./derive";

export interface CostEntry {
  occurredOn: string;
  kind: CategoryKind;
  cost: number | null;
}

export interface CostDocument {
  startsOn: string | null;
  expiresOn: string | null;
  createdOn: string;
  cost: number | null;
}

export interface CostBreakdown {
  fuel: number;
  service: number;
  fees: number;
  other: number;
  total: number;
}

export interface Bounds {
  from?: string;
  to?: string;
}

const within = (d: string, b: Bounds) => (!b.from || d >= b.from) && (!b.to || d <= b.to);

/** The day a document's cost lands on: when its period started. */
export function documentCostDay(d: CostDocument): string {
  return d.startsOn ?? d.expiresOn ?? d.createdOn;
}

export function ownershipCosts(
  entries: readonly CostEntry[],
  documents: readonly CostDocument[],
  bounds: Bounds = {},
): CostBreakdown {
  const out: CostBreakdown = { fuel: 0, service: 0, fees: 0, other: 0, total: 0 };
  for (const e of entries) {
    if (e.cost === null || !within(e.occurredOn, bounds)) continue;
    if (e.kind === "FUEL") out.fuel += e.cost;
    else if (e.kind === "SERVICE") out.service += e.cost;
    else out.other += e.cost;
  }
  for (const d of documents) {
    if (d.cost === null || !within(documentCostDay(d), bounds)) continue;
    out.fees += d.cost;
  }
  out.total = out.fuel + out.service + out.fees + out.other;
  return round(out);
}

export interface YearCosts extends CostBreakdown {
  year: string;
}

/** One row per calendar year that has any cost, oldest first. */
export function costsByYear(entries: readonly CostEntry[], documents: readonly CostDocument[]): YearCosts[] {
  const years = new Set<string>();
  for (const e of entries) if (e.cost !== null) years.add(e.occurredOn.slice(0, 4));
  for (const d of documents) if (d.cost !== null) years.add(documentCostDay(d).slice(0, 4));
  return [...years].sort().map((year) => ({
    year,
    ...ownershipCosts(entries, documents, { from: `${year}-01-01`, to: `${year}-12-31` }),
  }));
}

function round(b: CostBreakdown): CostBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { fuel: r(b.fuel), service: r(b.service), fees: r(b.fees), other: r(b.other), total: r(b.total) };
}
